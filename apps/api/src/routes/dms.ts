import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { z } from 'zod'
import { and, desc, eq, inArray, isNull, lt, ne, or, sql } from '@workspace/db'
import { schema, type Database } from '@workspace/db'
import { assetUrl } from '@workspace/media/s3'
import { requireAuth, type HonoEnv } from '../middleware/session.ts'
import { invalidateUnreadCounts } from '../lib/notify.ts'
import { parseCursor } from '../lib/cursor.ts'
import { dmChannel } from '../lib/pubsub.ts'
import { toMediaDto, type MediaDto } from '../lib/post-dto.ts'

export const dmsRoute = new Hono<HonoEnv>()

dmsRoute.use('*', requireAuth())

const sendSchema = z
  .object({
    text: z.string().trim().min(1).max(4000).optional(),
    sharedPostId: z.string().uuid().optional(),
    sharedArticleId: z.string().uuid().optional(),
    mediaId: z.string().uuid().optional(),
  })
  .refine((b) => b.text || b.sharedPostId || b.sharedArticleId || b.mediaId, {
    message: 'message must include text, media, or a shared post/article',
  })

const startSchema = z
  .object({
    userId: z.string().uuid().optional(),
    userIds: z.array(z.string().uuid()).max(50).optional(),
    title: z.string().trim().min(1).max(80).optional(),
  })
  .refine((b) => b.userId || (b.userIds && b.userIds.length > 0), {
    message: 'userId or userIds required',
  })

// Confirms the caller is an active member of the conversation. Returns the row, or null.
async function loadMembership(db: any, conversationId: string, userId: string) {
  const [row] = await db
    .select()
    .from(schema.conversationMembers)
    .where(
      and(
        eq(schema.conversationMembers.conversationId, conversationId),
        eq(schema.conversationMembers.userId, userId),
        isNull(schema.conversationMembers.leftAt),
      ),
    )
    .limit(1)
  return row ?? null
}

// Live feed of DM events for the current user. One SSE connection per browser tab; events are
// JSON payloads like `{ type: 'message', conversationId, message }` or `{ type: 'read', ... }`.
// Clients merge these into their local state. Falls back gracefully to polling when the socket
// drops (EventSource auto-reconnects).
dmsRoute.get('/stream', async (c) => {
  const session = c.get('session')!
  const { pubsub } = c.get('ctx')
  const me = session.user.id

  return streamSSE(c, async (stream) => {
    let unsubscribe: (() => Promise<void>) | null = null
    let closed = false

    stream.onAbort(async () => {
      closed = true
      if (unsubscribe) await unsubscribe().catch(() => {})
    })

    unsubscribe = await pubsub.subscribe(dmChannel(me), (payload) => {
      if (closed) return
      stream.writeSSE({ event: 'dm', data: JSON.stringify(payload) }).catch(() => {})
    })

    // Initial handshake so the client knows the stream is live.
    await stream.writeSSE({ event: 'ready', data: JSON.stringify({ at: Date.now() }) })

    // Heartbeat: keep the connection open across proxies (Cloudflare closes idle SSE after ~100s).
    while (!closed) {
      await stream.sleep(25_000)
      if (closed) break
      await stream
        .writeSSE({ event: 'ping', data: String(Date.now()) })
        .catch(() => {
          closed = true
        })
    }
  })
})

// List my conversations with last-message preview, other-member info (1:1), and unread count.
// `folder` selects between the main inbox (`requestState in ('none','accepted')`) and pending
// message requests (`requestState='pending'`). Default is `inbox` so legacy clients don't get
// requests mixed in. `requestCount` is always returned so the UI can render the tab badge
// without a second round-trip.
dmsRoute.get('/', async (c) => {
  const session = c.get('session')!
  const { db, mediaEnv } = c.get('ctx')
  const me = session.user.id
  const folder = c.req.query('folder') === 'requests' ? 'requests' : 'inbox'

  const folderFilter =
    folder === 'requests'
      ? eq(schema.conversationMembers.requestState, 'pending')
      : inArray(schema.conversationMembers.requestState, ['none', 'accepted'])

  // Pending requests count is always shown on the inbox tab so users can see new requests
  // without polling /requests; one cheap aggregate is fine.
  const [pendingRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.conversationMembers)
    .where(
      and(
        eq(schema.conversationMembers.userId, me),
        isNull(schema.conversationMembers.leftAt),
        eq(schema.conversationMembers.requestState, 'pending'),
      ),
    )
  const requestCount = pendingRow?.n ?? 0

  const myConvs = await db
    .select({
      conv: schema.conversations,
      member: schema.conversationMembers,
    })
    .from(schema.conversationMembers)
    .innerJoin(
      schema.conversations,
      eq(schema.conversations.id, schema.conversationMembers.conversationId),
    )
    .where(
      and(
        eq(schema.conversationMembers.userId, me),
        isNull(schema.conversationMembers.leftAt),
        folderFilter,
      ),
    )
    .orderBy(desc(schema.conversations.lastMessageAt))
    .limit(50)

  if (myConvs.length === 0) return c.json({ conversations: [], requestCount, folder })

  const convIds = myConvs.map((r) => r.conv.id)
  // postgres-js sends a JS array as one bound param; using `= ANY($1)` makes Postgres try to
  // parse the value as an array literal and explode. `IN (...)` with sql.join expands to one
  // bound param per id, which is what we want.
  const convIdsList = sql.join(
    convIds.map((id) => sql`${id}`),
    sql`, `,
  )

  // Per-convo: other members (for 1:1 we just take the first non-me), latest message,
  // unread count (messages newer than my lastReadMessageId, authored by someone else).
  const [otherMembers, latestMessages, unreadRows] = await Promise.all([
    db
      .select({
        conversationId: schema.conversationMembers.conversationId,
        user: schema.users,
      })
      .from(schema.conversationMembers)
      .innerJoin(schema.users, eq(schema.users.id, schema.conversationMembers.userId))
      .where(
        and(
          inArray(schema.conversationMembers.conversationId, convIds),
          sql`${schema.conversationMembers.userId} <> ${me}`,
          isNull(schema.conversationMembers.leftAt),
        ),
      ),
    db.execute(sql`
      SELECT DISTINCT ON (conversation_id) conversation_id, id, sender_id, kind, text, created_at
      FROM ${schema.messages}
      WHERE conversation_id IN (${convIdsList}) AND deleted_at IS NULL
      ORDER BY conversation_id, created_at DESC
    `),
    db.execute(sql`
      SELECT m.conversation_id AS conv_id, COUNT(*)::int AS n
      FROM ${schema.messages} m
      JOIN ${schema.conversationMembers} cm
        ON cm.conversation_id = m.conversation_id AND cm.user_id = ${me}
      WHERE m.conversation_id IN (${convIdsList})
        AND m.sender_id <> ${me}
        AND m.deleted_at IS NULL
        AND (
          cm.last_read_message_id IS NULL OR
          m.created_at > (
            SELECT created_at FROM ${schema.messages} WHERE id = cm.last_read_message_id
          )
        )
      GROUP BY m.conversation_id
    `),
  ])

  const otherByConv = new Map<string, Array<typeof otherMembers[number]['user']>>()
  for (const r of otherMembers) {
    const list = otherByConv.get(r.conversationId) ?? []
    list.push(r.user)
    otherByConv.set(r.conversationId, list)
  }
  const latestByConv = new Map<string, any>()
  for (const r of latestMessages as unknown as Array<any>) {
    latestByConv.set(r.conversation_id, r)
  }
  const unreadByConv = new Map<string, number>()
  for (const r of unreadRows as unknown as Array<any>) {
    unreadByConv.set(r.conv_id, r.n)
  }

  const conversations = myConvs.map((r) => {
    const others = (otherByConv.get(r.conv.id) ?? []).map((u) => ({
      id: u.id,
      handle: u.handle,
      displayName: u.displayName,
      avatarUrl: assetUrl(mediaEnv, u.avatarUrl),
      isVerified: u.isVerified,
      role: u.role,
    }))
    const latest = latestByConv.get(r.conv.id)
    return {
      id: r.conv.id,
      kind: r.conv.kind,
      title: r.conv.title,
      createdAt: r.conv.createdAt.toISOString(),
      lastMessageAt: r.conv.lastMessageAt?.toISOString() ?? null,
      unreadCount: unreadByConv.get(r.conv.id) ?? 0,
      members: others,
      requestState: r.member.requestState,
      lastMessage: latest
        ? {
            id: latest.id,
            senderId: latest.sender_id,
            kind: latest.kind,
            text: latest.text,
            createdAt: new Date(latest.created_at).toISOString(),
          }
        : null,
    }
  })

  return c.json({ conversations, requestCount, folder })
})

// Total unread across my non-pending conversations + a separate count of pending requests.
// Pending-request messages are intentionally excluded from `count` so the sidebar badge
// reflects messages the user has chosen to receive; `requestCount` lets the UI surface
// pending requests with a distinct affordance.
dmsRoute.get('/unread-count', async (c) => {
  const session = c.get('session')!
  const { db } = c.get('ctx')
  const me = session.user.id
  const result = await db.execute(sql`
    SELECT COUNT(*)::int AS n
    FROM ${schema.messages} m
    JOIN ${schema.conversationMembers} cm
      ON cm.conversation_id = m.conversation_id AND cm.user_id = ${me}
    WHERE m.sender_id <> ${me}
      AND m.deleted_at IS NULL
      AND cm.left_at IS NULL
      AND cm.request_state IN ('none', 'accepted')
      AND (
        cm.last_read_message_id IS NULL OR
        m.created_at > (SELECT created_at FROM ${schema.messages} WHERE id = cm.last_read_message_id)
      )
  `)
  const [pendingRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.conversationMembers)
    .where(
      and(
        eq(schema.conversationMembers.userId, me),
        isNull(schema.conversationMembers.leftAt),
        eq(schema.conversationMembers.requestState, 'pending'),
      ),
    )
  const row = (result as unknown as Array<{ n: number }>)[0]
  return c.json({ count: row?.n ?? 0, requestCount: pendingRow?.n ?? 0 })
})

// Start a conversation. With one peer (userId or userIds[0]) it find-or-creates the canonical
// 1:1; with multiple peers it always creates a fresh group, with the caller as admin and an
// optional title (otherwise UI generates one from member names).
dmsRoute.post('/', async (c) => {
  const session = c.get('session')!
  const { db, rateLimit } = c.get('ctx')
  await rateLimit(c, 'dms.start')
  const me = session.user.id
  const body = startSchema.parse(await c.req.json())
  const peerIds = Array.from(
    new Set((body.userIds ?? (body.userId ? [body.userId] : [])).filter((id) => id !== me)),
  )
  if (peerIds.length === 0) return c.json({ error: 'no_peers' }, 400)

  // Block check: anyone blocking me (or me blocking anyone) breaks the create.
  const blocks = await db
    .select({
      blocker: schema.blocks.blockerId,
      blocked: schema.blocks.blockedId,
    })
    .from(schema.blocks)
    .where(
      or(
        and(eq(schema.blocks.blockerId, me), inArray(schema.blocks.blockedId, peerIds)),
        and(eq(schema.blocks.blockedId, me), inArray(schema.blocks.blockerId, peerIds)),
      ),
    )
  if (blocks.length > 0) return c.json({ error: 'blocked' }, 403)

  // 1:1: idempotent — return any existing conversation between just these two users.
  if (peerIds.length === 1) {
    const other = peerIds[0]!
    const existing = await db.execute(sql`
      SELECT c.id
      FROM ${schema.conversations} c
      JOIN ${schema.conversationMembers} m1
        ON m1.conversation_id = c.id AND m1.user_id = ${me} AND m1.left_at IS NULL
      JOIN ${schema.conversationMembers} m2
        ON m2.conversation_id = c.id AND m2.user_id = ${other} AND m2.left_at IS NULL
      WHERE c.kind = 'dm'
      LIMIT 1
    `)
    const existingRow = (existing as unknown as Array<{ id: string }>)[0]
    if (existingRow) return c.json({ id: existingRow.id, created: false })
  }

  const kind = peerIds.length >= 2 ? 'group' : 'dm'

  // A peer's row starts as 'pending' (i.e. a message request) unless we're already mutuals
  // — either I follow them, or they follow me. Mutuals get 'accepted' so the convo lands
  // straight in their main inbox. Group convos opt out: joining a group is an explicit invite
  // flow, not a cold DM, so all peers go in as 'accepted'.
  const acceptedPeerIds = new Set<string>()
  if (kind === 'dm') {
    const edges = await db
      .select({
        followerId: schema.follows.followerId,
        followeeId: schema.follows.followeeId,
      })
      .from(schema.follows)
      .where(
        or(
          and(eq(schema.follows.followerId, me), inArray(schema.follows.followeeId, peerIds)),
          and(eq(schema.follows.followeeId, me), inArray(schema.follows.followerId, peerIds)),
        ),
      )
    for (const e of edges) acceptedPeerIds.add(e.followerId === me ? e.followeeId : e.followerId)
  } else {
    for (const id of peerIds) acceptedPeerIds.add(id)
  }

  const id = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(schema.conversations)
      .values({ kind, title: body.title ?? null, createdById: me })
      .returning({ id: schema.conversations.id })
    if (!created) throw new Error('failed_to_create_conversation')
    await tx.insert(schema.conversationMembers).values([
      { conversationId: created.id, userId: me, role: 'admin', requestState: 'accepted' },
      ...peerIds.map((userId) => ({
        conversationId: created.id,
        userId,
        role: 'member' as const,
        requestState: acceptedPeerIds.has(userId) ? ('accepted' as const) : ('pending' as const),
      })),
    ])
    return created.id
  })

  c.get('ctx').track(peerIds.length > 1 ? 'dm_group_created' : 'dm_started', me)
  return c.json({ id, created: true })
})

// Accept a pending message request. Idempotent — a second call on an already-accepted
// conversation just returns ok. Republishes a membership event so the sender sees nothing
// special; from their side the convo was always accepted.
dmsRoute.post('/:id/accept', async (c) => {
  const session = c.get('session')!
  const { db, pubsub, cache, rateLimit } = c.get('ctx')
  await rateLimit(c, 'dms.respond')
  const me = session.user.id
  const conversationId = c.req.param('id')

  const membership = await loadMembership(db, conversationId, me)
  if (!membership) return c.json({ error: 'not_a_member' }, 403)
  if (membership.requestState === 'declined') return c.json({ error: 'declined' }, 410)

  await db
    .update(schema.conversationMembers)
    .set({ requestState: 'accepted' })
    .where(
      and(
        eq(schema.conversationMembers.conversationId, conversationId),
        eq(schema.conversationMembers.userId, me),
      ),
    )
  // Accepting moves any messages from the requester out of the 'pending' bucket and into
  // the unread count, so blow the cached count for this user.
  await invalidateUnreadCounts(cache, [me])
  await pubsub.publish(dmChannel(me), { type: 'membership', conversationId })
  return c.json({ ok: true })
})

// Decline a pending message request. Soft-leaves the conversation so it disappears from the
// receiver's listings and they stop accruing unread on it. Sender is not notified — declines
// are intentionally silent. The conversation row is preserved (in case the same user later
// gets a follow-from / accepts) but the receiver won't see further messages.
dmsRoute.post('/:id/decline', async (c) => {
  const session = c.get('session')!
  const { db, pubsub, cache, rateLimit } = c.get('ctx')
  await rateLimit(c, 'dms.respond')
  const me = session.user.id
  const conversationId = c.req.param('id')

  const membership = await loadMembership(db, conversationId, me)
  if (!membership) return c.json({ error: 'not_a_member' }, 403)

  await db
    .update(schema.conversationMembers)
    .set({ requestState: 'declined', leftAt: new Date() })
    .where(
      and(
        eq(schema.conversationMembers.conversationId, conversationId),
        eq(schema.conversationMembers.userId, me),
      ),
    )
  await invalidateUnreadCounts(cache, [me])
  await pubsub.publish(dmChannel(me), { type: 'membership', conversationId })
  return c.json({ ok: true })
})

// Group-only operations below. Schema enforces `kind in ('dm','group')`; we additionally guard
// at the route layer so 1:1s can't be mutated structurally.

const addMembersSchema = z.object({
  userIds: z.array(z.string().uuid()).min(1).max(50),
})

dmsRoute.post('/:id/members', async (c) => {
  const session = c.get('session')!
  const { db, pubsub, rateLimit } = c.get('ctx')
  await rateLimit(c, 'dms.members')
  const me = session.user.id
  const conversationId = c.req.param('id')
  const body = addMembersSchema.parse(await c.req.json())

  const conv = await loadConversationForAdmin(db, conversationId, me)
  if ('error' in conv) return c.json({ error: conv.error }, conv.status)

  // Don't re-insert anyone who's already an active member; reactivate any soft-left rows.
  const existingMembers = await db
    .select({
      userId: schema.conversationMembers.userId,
      leftAt: schema.conversationMembers.leftAt,
    })
    .from(schema.conversationMembers)
    .where(
      and(
        eq(schema.conversationMembers.conversationId, conversationId),
        inArray(schema.conversationMembers.userId, body.userIds),
      ),
    )
  const existingMap = new Map(existingMembers.map((m) => [m.userId, m]))
  const toInsert = body.userIds.filter((id) => !existingMap.has(id))
  const toReactivate = body.userIds.filter((id) => existingMap.get(id)?.leftAt)

  await db.transaction(async (tx) => {
    if (toInsert.length > 0) {
      await tx.insert(schema.conversationMembers).values(
        toInsert.map((userId) => ({
          conversationId,
          userId,
          role: 'member' as const,
        })),
      )
    }
    if (toReactivate.length > 0) {
      await tx
        .update(schema.conversationMembers)
        .set({ leftAt: null })
        .where(
          and(
            eq(schema.conversationMembers.conversationId, conversationId),
            inArray(schema.conversationMembers.userId, toReactivate),
          ),
        )
    }
  })

  // Push a membership event so open clients refresh the header / member list.
  await pubsub.publish(dmChannel(me), { type: 'membership', conversationId })
  for (const userId of body.userIds) {
    await pubsub.publish(dmChannel(userId), { type: 'membership', conversationId })
  }
  c.get('ctx').track('dm_members_added', me, { count: body.userIds.length })
  return c.json({ ok: true, added: toInsert.length + toReactivate.length })
})

dmsRoute.delete('/:id/members/:userId', async (c) => {
  const session = c.get('session')!
  const { db, pubsub, rateLimit } = c.get('ctx')
  await rateLimit(c, 'dms.members')
  const me = session.user.id
  const conversationId = c.req.param('id')
  const target = c.req.param('userId')

  // Members can remove themselves; only admins of a group can remove someone else.
  if (target !== me) {
    const conv = await loadConversationForAdmin(db, conversationId, me)
    if ('error' in conv) return c.json({ error: conv.error }, conv.status)
  } else {
    const membership = await loadMembership(db, conversationId, me)
    if (!membership) return c.json({ error: 'not_a_member' }, 403)
  }

  await db
    .update(schema.conversationMembers)
    .set({ leftAt: new Date() })
    .where(
      and(
        eq(schema.conversationMembers.conversationId, conversationId),
        eq(schema.conversationMembers.userId, target),
      ),
    )

  await pubsub.publish(dmChannel(target), { type: 'membership', conversationId })
  await pubsub.publish(dmChannel(me), { type: 'membership', conversationId })
  c.get('ctx').track('dm_member_removed', me)
  return c.json({ ok: true })
})

const renameSchema = z.object({
  title: z.string().trim().min(1).max(80).nullable(),
})

dmsRoute.patch('/:id', async (c) => {
  const session = c.get('session')!
  const { db, pubsub } = c.get('ctx')
  const me = session.user.id
  const conversationId = c.req.param('id')
  const body = renameSchema.parse(await c.req.json())

  const conv = await loadConversationForAdmin(db, conversationId, me)
  if ('error' in conv) return c.json({ error: conv.error }, conv.status)

  await db
    .update(schema.conversations)
    .set({ title: body.title })
    .where(eq(schema.conversations.id, conversationId))

  // Notify every active member so headers update everywhere.
  const members = await db
    .select({ userId: schema.conversationMembers.userId })
    .from(schema.conversationMembers)
    .where(
      and(
        eq(schema.conversationMembers.conversationId, conversationId),
        isNull(schema.conversationMembers.leftAt),
      ),
    )
  for (const m of members) {
    await pubsub.publish(dmChannel(m.userId), { type: 'membership', conversationId })
  }
  return c.json({ ok: true })
})

// ---- Invitation links ----

const createInviteSchema = z.object({
  expiresInHours: z.number().int().positive().max(24 * 365).optional(),
  maxUses: z.number().int().positive().max(1000).optional(),
})

dmsRoute.post('/:id/invites', async (c) => {
  const session = c.get('session')!
  const { db, rateLimit } = c.get('ctx')
  await rateLimit(c, 'dms.invites')
  const me = session.user.id
  const conversationId = c.req.param('id')
  const body = createInviteSchema.parse(await c.req.json().catch(() => ({})))

  const conv = await loadConversationForAdmin(db, conversationId, me)
  if ('error' in conv) return c.json({ error: conv.error }, conv.status)

  // Token must be opaque and url-safe — base64url over 32 random bytes.
  const token = b64url(crypto.getRandomValues(new Uint8Array(32)))
  const expiresAt = body.expiresInHours
    ? new Date(Date.now() + body.expiresInHours * 60 * 60 * 1000)
    : null

  const [invite] = await db
    .insert(schema.conversationInvites)
    .values({
      conversationId,
      token,
      createdById: me,
      expiresAt,
      maxUses: body.maxUses ?? null,
    })
    .returning()
  if (!invite) return c.json({ error: 'create_failed' }, 500)
  return c.json({ invite: serializeInvite(invite) })
})

dmsRoute.get('/:id/invites', async (c) => {
  const session = c.get('session')!
  const { db } = c.get('ctx')
  const me = session.user.id
  const conversationId = c.req.param('id')

  const conv = await loadConversationForAdmin(db, conversationId, me)
  if ('error' in conv) return c.json({ error: conv.error }, conv.status)

  const rows = await db
    .select()
    .from(schema.conversationInvites)
    .where(eq(schema.conversationInvites.conversationId, conversationId))
    .orderBy(desc(schema.conversationInvites.createdAt))
  return c.json({ invites: rows.map(serializeInvite) })
})

dmsRoute.delete('/:id/invites/:inviteId', async (c) => {
  const session = c.get('session')!
  const { db, rateLimit } = c.get('ctx')
  await rateLimit(c, 'dms.invites')
  const me = session.user.id
  const conversationId = c.req.param('id')
  const inviteId = c.req.param('inviteId')

  const conv = await loadConversationForAdmin(db, conversationId, me)
  if ('error' in conv) return c.json({ error: conv.error }, conv.status)

  await db
    .update(schema.conversationInvites)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(schema.conversationInvites.id, inviteId),
        eq(schema.conversationInvites.conversationId, conversationId),
      ),
    )
  return c.json({ ok: true })
})

// Helper: format an invite row for the client. Returns the join URL absolute against the API
// host; the web app can swap host for its own domain when rendering.
function serializeInvite(row: typeof schema.conversationInvites.$inferSelect) {
  return {
    id: row.id,
    token: row.token,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    maxUses: row.maxUses,
    usedCount: row.usedCount,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }
}

function b64url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// Helper: load a group conversation that the caller can administer. 1:1s reject — there's no
// admin concept for two-person chats. Returns either { conv, kind } or an { error, status } shape.
async function loadConversationForAdmin(
  db: Database,
  conversationId: string,
  userId: string,
): Promise<
  | { conv: typeof schema.conversations.$inferSelect; kind: 'group' }
  | { error: string; status: 403 | 404 }
> {
  const [conv] = await db
    .select()
    .from(schema.conversations)
    .where(eq(schema.conversations.id, conversationId))
    .limit(1)
  if (!conv) return { error: 'not_found', status: 404 }
  if (conv.kind !== 'group') return { error: 'not_a_group', status: 403 }
  const membership = await loadMembership(db, conversationId, userId)
  if (!membership || membership.role !== 'admin') {
    return { error: 'not_admin', status: 403 }
  }
  return { conv, kind: 'group' }
}

// Conversation metadata: kind, title, all currently-active members. Used by the thread UI to
// render the header and the settings drawer.
dmsRoute.get('/:id', async (c) => {
  const session = c.get('session')!
  const { db, mediaEnv } = c.get('ctx')
  const me = session.user.id
  const conversationId = c.req.param('id')

  const membership = await loadMembership(db, conversationId, me)
  if (!membership) return c.json({ error: 'not_a_member' }, 403)

  const [conv] = await db
    .select()
    .from(schema.conversations)
    .where(eq(schema.conversations.id, conversationId))
    .limit(1)
  if (!conv) return c.json({ error: 'not_found' }, 404)

  const memberRows = await db
    .select({ user: schema.users, member: schema.conversationMembers })
    .from(schema.conversationMembers)
    .innerJoin(schema.users, eq(schema.users.id, schema.conversationMembers.userId))
    .where(
      and(
        eq(schema.conversationMembers.conversationId, conversationId),
        isNull(schema.conversationMembers.leftAt),
      ),
    )

  return c.json({
    conversation: {
      id: conv.id,
      kind: conv.kind,
      title: conv.title,
      createdAt: conv.createdAt.toISOString(),
      myRole: membership.role,
      myRequestState: membership.requestState,
      members: memberRows.map((r) => ({
        id: r.user.id,
        handle: r.user.handle,
        displayName: r.user.displayName,
        avatarUrl: assetUrl(mediaEnv, r.user.avatarUrl),
        isVerified: r.user.isVerified,
        role: r.user.role,
        chatRole: r.member.role,
        lastReadMessageId: r.member.lastReadMessageId,
      })),
    },
  })
})

// Paginated message history for a conversation. Returned newest-first; clients reverse for display.
dmsRoute.get('/:id/messages', async (c) => {
  const session = c.get('session')!
  const { db, mediaEnv } = c.get('ctx')
  const me = session.user.id
  const conversationId = c.req.param('id')
  const limit = Math.min(Number(c.req.query('limit') ?? 50), 100)
  const cursor = parseCursor(c.req.query('cursor'))

  const membership = await loadMembership(db, conversationId, me)
  if (!membership) return c.json({ error: 'not_a_member' }, 403)

  const rows = await db
    .select({ message: schema.messages, sender: schema.users })
    .from(schema.messages)
    .innerJoin(schema.users, eq(schema.users.id, schema.messages.senderId))
    .where(
      and(
        eq(schema.messages.conversationId, conversationId),
        isNull(schema.messages.deletedAt),
        cursor ? lt(schema.messages.createdAt, cursor) : undefined,
      ),
    )
    .orderBy(desc(schema.messages.createdAt))
    .limit(limit)

  const mediaIds = Array.from(
    new Set(rows.map((r) => r.message.mediaId).filter((id): id is string => Boolean(id))),
  )
  const mediaMap = new Map<string, MediaDto>()
  if (mediaIds.length > 0) {
    const mediaRows = await db
      .select()
      .from(schema.media)
      .where(inArray(schema.media.id, mediaIds))
    for (const m of mediaRows) mediaMap.set(m.id, toMediaDto(m, mediaEnv))
  }

  // Batch-load reactions for the page so each bubble renders its chip strip on first paint.
  const messageIds = rows.map((r) => r.message.id)
  const reactionMap = new Map<string, Array<{ emoji: string; userId: string }>>()
  if (messageIds.length > 0) {
    const reactionRows = await db
      .select()
      .from(schema.messageReactions)
      .where(inArray(schema.messageReactions.messageId, messageIds))
    for (const r of reactionRows) {
      const arr = reactionMap.get(r.messageId) ?? []
      arr.push({ emoji: r.emoji, userId: r.userId })
      reactionMap.set(r.messageId, arr)
    }
  }

  const messages = rows.map((r) => ({
    id: r.message.id,
    conversationId: r.message.conversationId,
    senderId: r.message.senderId,
    kind: r.message.kind,
    text: r.message.text,
    sharedPostId: r.message.sharedPostId,
    sharedArticleId: r.message.sharedArticleId,
    media: r.message.mediaId ? mediaMap.get(r.message.mediaId) ?? null : null,
    reactions: reactionMap.get(r.message.id) ?? [],
    editedAt: r.message.editedAt?.toISOString() ?? null,
    createdAt: r.message.createdAt.toISOString(),
    sender: {
      id: r.sender.id,
      handle: r.sender.handle,
      displayName: r.sender.displayName,
      avatarUrl: assetUrl(mediaEnv, r.sender.avatarUrl),
      isVerified: r.sender.isVerified,
      role: r.sender.role,
    },
  }))
  const nextCursor =
    rows.length === limit ? rows[rows.length - 1]!.message.createdAt.toISOString() : null
  return c.json({ messages, nextCursor })
})

// Send a message. Updates the conversation's lastMessageAt and notifies non-self members.
dmsRoute.post('/:id/messages', async (c) => {
  const session = c.get('session')!
  const { db, mediaEnv, pubsub, rateLimit } = c.get('ctx')
  await rateLimit(c, 'dms.send')
  const me = session.user.id
  const conversationId = c.req.param('id')
  const body = sendSchema.parse(await c.req.json())

  const membership = await loadMembership(db, conversationId, me)
  if (!membership) return c.json({ error: 'not_a_member' }, 403)
  // Pending requests can be previewed but not replied to — the receiver must accept first,
  // and a declined member's row is soft-left (membership would be null above).
  if (membership.requestState === 'pending') return c.json({ error: 'request_pending' }, 403)

  // Verify the media belongs to me before attaching — stops mediaId enumeration / theft.
  if (body.mediaId) {
    const [m] = await db
      .select({ ownerId: schema.media.ownerId })
      .from(schema.media)
      .where(eq(schema.media.id, body.mediaId))
      .limit(1)
    if (!m || m.ownerId !== me) return c.json({ error: 'invalid_media' }, 400)
  }

  const kind: 'text' | 'media' | 'post_share' | 'article_share' = body.mediaId
    ? 'media'
    : body.sharedPostId
    ? 'post_share'
    : body.sharedArticleId
    ? 'article_share'
    : 'text'

  const message = await db.transaction(async (tx) => {
    const [m] = await tx
      .insert(schema.messages)
      .values({
        conversationId,
        senderId: me,
        kind,
        text: body.text ?? null,
        sharedPostId: body.sharedPostId ?? null,
        sharedArticleId: body.sharedArticleId ?? null,
        mediaId: body.mediaId ?? null,
      })
      .returning()
    if (!m) throw new Error('failed_to_send_message')
    await tx
      .update(schema.conversations)
      .set({ lastMessageAt: m.createdAt })
      .where(eq(schema.conversations.id, conversationId))

    // Auto-mark sender as read up to this message.
    await tx
      .update(schema.conversationMembers)
      .set({ lastReadMessageId: m.id })
      .where(
        and(
          eq(schema.conversationMembers.conversationId, conversationId),
          eq(schema.conversationMembers.userId, me),
        ),
      )

    // Surface this message to every other member's session (so their inbox/unread counters
    // refresh). DMs are intentionally NOT fanned out to the notifications table — the
    // messages tab carries its own unread count via /api/dms/unread-count.
    const others = await tx
      .select({ userId: schema.conversationMembers.userId })
      .from(schema.conversationMembers)
      .where(
        and(
          eq(schema.conversationMembers.conversationId, conversationId),
          isNull(schema.conversationMembers.leftAt),
          sql`${schema.conversationMembers.userId} <> ${me}`,
        ),
      )
    return { message: m, otherUserIds: others.map((o) => o.userId) }
  })

  let mediaDto: MediaDto | null = null
  if (message.message.mediaId) {
    const [m] = await db
      .select()
      .from(schema.media)
      .where(eq(schema.media.id, message.message.mediaId))
      .limit(1)
    if (m) mediaDto = toMediaDto(m, mediaEnv)
  }

  const payload = {
    id: message.message.id,
    conversationId: message.message.conversationId,
    senderId: message.message.senderId,
    kind: message.message.kind,
    text: message.message.text,
    sharedPostId: message.message.sharedPostId,
    sharedArticleId: message.message.sharedArticleId,
    media: mediaDto,
    reactions: [] as Array<{ emoji: string; userId: string }>,
    editedAt: message.message.editedAt?.toISOString() ?? null,
    createdAt: message.message.createdAt.toISOString(),
  }

  // Fan-out: every member (including me, so my other tabs stay in sync) gets the event.
  const recipients = [...message.otherUserIds, me]
  await Promise.all(
    recipients.map((userId) =>
      pubsub.publish(dmChannel(userId), { type: 'message', conversationId, message: payload }),
    ),
  )

  c.get('ctx').track('dm_sent', me)
  return c.json({ message: payload })
})

const editMessageSchema = z.object({
  text: z.string().trim().min(1).max(4000),
})
const MESSAGE_EDIT_WINDOW_MS = 15 * 60 * 1000

// Edit a message (sender-only, within a 15-min window). Edits set `editedAt` so the UI can
// render an "(edited)" marker, and a `message_edited` SSE event lets every member's bubble
// update in place without a refetch.
dmsRoute.patch('/:id/messages/:msgId', async (c) => {
  const session = c.get('session')!
  const { db, pubsub, rateLimit } = c.get('ctx')
  await rateLimit(c, 'dms.message-mutate')
  const me = session.user.id
  const conversationId = c.req.param('id')
  const msgId = c.req.param('msgId')
  const body = editMessageSchema.parse(await c.req.json())

  const [msg] = await db
    .select()
    .from(schema.messages)
    .where(eq(schema.messages.id, msgId))
    .limit(1)
  if (!msg || msg.conversationId !== conversationId) return c.json({ error: 'not_found' }, 404)
  if (msg.senderId !== me) return c.json({ error: 'forbidden' }, 403)
  if (msg.deletedAt) return c.json({ error: 'already_deleted' }, 410)
  if (Date.now() - msg.createdAt.getTime() > MESSAGE_EDIT_WINDOW_MS) {
    return c.json({ error: 'edit_window_expired' }, 403)
  }

  const editedAt = new Date()
  await db
    .update(schema.messages)
    .set({ text: body.text, editedAt })
    .where(eq(schema.messages.id, msgId))

  // Fan-out to every active member.
  const recipients = await activeMemberIds(db, conversationId)
  await Promise.all(
    recipients.map((userId) =>
      pubsub.publish(dmChannel(userId), {
        type: 'message_edited',
        conversationId,
        messageId: msgId,
        text: body.text,
        editedAt: editedAt.toISOString(),
      }),
    ),
  )
  c.get('ctx').track('dm_message_edited', me)
  return c.json({ ok: true, editedAt: editedAt.toISOString() })
})

// Soft-delete a message. Sender always; group admin can delete anyone's. Bubble renders as
// "deleted message" placeholder via the SSE event.
dmsRoute.delete('/:id/messages/:msgId', async (c) => {
  const session = c.get('session')!
  const { db, pubsub, rateLimit } = c.get('ctx')
  await rateLimit(c, 'dms.message-mutate')
  const me = session.user.id
  const conversationId = c.req.param('id')
  const msgId = c.req.param('msgId')

  const [msg] = await db
    .select()
    .from(schema.messages)
    .where(eq(schema.messages.id, msgId))
    .limit(1)
  if (!msg || msg.conversationId !== conversationId) return c.json({ error: 'not_found' }, 404)
  if (msg.deletedAt) return c.json({ ok: true })

  if (msg.senderId !== me) {
    // Non-sender can only delete in groups they admin.
    const conv = await loadConversationForAdmin(db, conversationId, me)
    if ('error' in conv) return c.json({ error: 'forbidden' }, 403)
  } else {
    const membership = await loadMembership(db, conversationId, me)
    if (!membership) return c.json({ error: 'not_a_member' }, 403)
  }

  await db
    .update(schema.messages)
    .set({ deletedAt: new Date() })
    .where(eq(schema.messages.id, msgId))

  const recipients = await activeMemberIds(db, conversationId)
  await Promise.all(
    recipients.map((userId) =>
      pubsub.publish(dmChannel(userId), {
        type: 'message_deleted',
        conversationId,
        messageId: msgId,
      }),
    ),
  )
  c.get('ctx').track('dm_message_deleted', me)
  return c.json({ ok: true })
})

const reactionSchema = z.object({
  emoji: z.string().trim().min(1).max(16),
})

// Toggle a reaction. Idempotent — second POST of the same emoji removes it. Composite PK on
// (messageId, userId, emoji) handles dedupe at the DB level.
dmsRoute.post('/:id/messages/:msgId/reactions', async (c) => {
  const session = c.get('session')!
  const { db, pubsub, rateLimit } = c.get('ctx')
  await rateLimit(c, 'dms.react')
  const me = session.user.id
  const conversationId = c.req.param('id')
  const msgId = c.req.param('msgId')
  const body = reactionSchema.parse(await c.req.json())

  // Verify membership + message belongs to the convo before mutating.
  const membership = await loadMembership(db, conversationId, me)
  if (!membership) return c.json({ error: 'not_a_member' }, 403)
  const [msg] = await db
    .select({ id: schema.messages.id })
    .from(schema.messages)
    .where(and(eq(schema.messages.id, msgId), eq(schema.messages.conversationId, conversationId)))
    .limit(1)
  if (!msg) return c.json({ error: 'not_found' }, 404)

  const [existing] = await db
    .select()
    .from(schema.messageReactions)
    .where(
      and(
        eq(schema.messageReactions.messageId, msgId),
        eq(schema.messageReactions.userId, me),
        eq(schema.messageReactions.emoji, body.emoji),
      ),
    )
    .limit(1)

  let op: 'add' | 'remove'
  if (existing) {
    await db
      .delete(schema.messageReactions)
      .where(
        and(
          eq(schema.messageReactions.messageId, msgId),
          eq(schema.messageReactions.userId, me),
          eq(schema.messageReactions.emoji, body.emoji),
        ),
      )
    op = 'remove'
  } else {
    await db
      .insert(schema.messageReactions)
      .values({ messageId: msgId, userId: me, emoji: body.emoji })
    op = 'add'
  }

  const recipients = await activeMemberIds(db, conversationId)
  await Promise.all(
    recipients.map((userId) =>
      pubsub.publish(dmChannel(userId), {
        type: 'reaction',
        conversationId,
        messageId: msgId,
        userId: me,
        emoji: body.emoji,
        op,
      }),
    ),
  )
  c.get('ctx').track('dm_reaction_toggled', me)
  return c.json({ ok: true, op })
})

async function activeMemberIds(db: Database, conversationId: string): Promise<Array<string>> {
  const rows = await db
    .select({ userId: schema.conversationMembers.userId })
    .from(schema.conversationMembers)
    .where(
      and(
        eq(schema.conversationMembers.conversationId, conversationId),
        isNull(schema.conversationMembers.leftAt),
      ),
    )
  return rows.map((r) => r.userId)
}

// Fire-and-forget typing ping. Frontend debounces at ~one per 3s; we publish to every other
// active member's channel and that's it — no DB write, ephemeral.
dmsRoute.post('/:id/typing', async (c) => {
  const session = c.get('session')!
  const { db, pubsub, rateLimit } = c.get('ctx')
  await rateLimit(c, 'dms.typing')
  const me = session.user.id
  const conversationId = c.req.param('id')

  const membership = await loadMembership(db, conversationId, me)
  if (!membership) return c.json({ error: 'not_a_member' }, 403)

  const others = await db
    .select({ userId: schema.conversationMembers.userId })
    .from(schema.conversationMembers)
    .where(
      and(
        eq(schema.conversationMembers.conversationId, conversationId),
        isNull(schema.conversationMembers.leftAt),
        sql`${schema.conversationMembers.userId} <> ${me}`,
      ),
    )
  await Promise.all(
    others.map((o) =>
      pubsub.publish(dmChannel(o.userId), {
        type: 'typing',
        conversationId,
        userId: me,
      }),
    ),
  )
  return c.json({ ok: true })
})

// Mark all messages up to and including a given message as read for the current user.
// If no messageId is given, advance to the latest message in the conversation.
dmsRoute.post('/:id/read', async (c) => {
  const session = c.get('session')!
  const { db, pubsub } = c.get('ctx')
  const me = session.user.id
  const conversationId = c.req.param('id')
  const body = (await c.req.json().catch(() => ({}))) as { messageId?: string }

  const membership = await loadMembership(db, conversationId, me)
  if (!membership) return c.json({ error: 'not_a_member' }, 403)

  let targetId = body.messageId ?? null
  if (!targetId) {
    const [latest] = await db
      .select({ id: schema.messages.id })
      .from(schema.messages)
      .where(
        and(
          eq(schema.messages.conversationId, conversationId),
          isNull(schema.messages.deletedAt),
        ),
      )
      .orderBy(desc(schema.messages.createdAt))
      .limit(1)
    targetId = latest?.id ?? null
  }

  if (!targetId) return c.json({ ok: true })

  await db
    .update(schema.conversationMembers)
    .set({ lastReadMessageId: targetId })
    .where(
      and(
        eq(schema.conversationMembers.conversationId, conversationId),
        eq(schema.conversationMembers.userId, me),
      ),
    )

  // Publish read receipt to every active member: my own channel for sidebar/tab sync, and
  // every other member so their thread can render "seen" indicators in real time.
  const memberRows = await db
    .select({ userId: schema.conversationMembers.userId })
    .from(schema.conversationMembers)
    .where(
      and(
        eq(schema.conversationMembers.conversationId, conversationId),
        isNull(schema.conversationMembers.leftAt),
      ),
    )
  const payload = { type: 'read' as const, conversationId, userId: me, messageId: targetId }
  await Promise.all(memberRows.map((r) => pubsub.publish(dmChannel(r.userId), payload)))

  return c.json({ ok: true })
})
