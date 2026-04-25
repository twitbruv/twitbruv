import { Hono } from 'hono'
import { and, asc, desc, eq, inArray, isNull, lt, sql, schema } from '@workspace/db'
import { assetUrl } from '@workspace/media/s3'
import { createListSchema, updateListSchema } from '@workspace/validators'
import { requireAuth, type HonoEnv } from '../middleware/session.ts'
import { toPostDto } from '../lib/post-dto.ts'
import { loadViewerFlags } from '../lib/viewer-flags.ts'
import { loadPostMedia } from '../lib/post-media.ts'
import { loadArticleCards } from '../lib/article-cards.ts'
import { loadRepostTargets } from '../lib/repost-targets.ts'
import { loadQuoteTargets } from '../lib/quote-targets.ts'
import { loadPolls } from '../lib/polls.ts'
import { parseCursor } from '../lib/cursor.ts'

export const listsRoute = new Hono<HonoEnv>()

interface ListDto {
  id: string
  ownerId: string
  ownerHandle: string | null
  ownerDisplayName: string | null
  slug: string
  title: string
  description: string | null
  isPrivate: boolean
  memberCount: number
  createdAt: string
  updatedAt: string
}

// Public: a user's lists. Hides private lists from non-owners.
listsRoute.get('/by/:handle', async (c) => {
  const { db } = c.get('ctx')
  const viewerId = c.get('session')?.user.id
  const handle = c.req.param('handle').replace(/^@/, '')

  const [owner] = await db
    .select({ id: schema.users.id, handle: schema.users.handle, displayName: schema.users.displayName })
    .from(schema.users)
    .where(and(eq(schema.users.handle, handle), isNull(schema.users.deletedAt)))
    .limit(1)
  if (!owner) return c.json({ error: 'not_found' }, 404)

  const isOwnerViewer = viewerId === owner.id
  const rows = await db
    .select()
    .from(schema.userLists)
    .where(
      and(
        eq(schema.userLists.ownerId, owner.id),
        isOwnerViewer ? undefined : eq(schema.userLists.isPrivate, false),
      ),
    )
    .orderBy(desc(schema.userLists.createdAt))

  return c.json({
    lists: rows.map((l) => toListDto(l, owner.handle, owner.displayName)),
  })
})

// Owner-only: viewer's own lists.
listsRoute.get('/me', requireAuth(), async (c) => {
  const session = c.get('session')!
  const { db } = c.get('ctx')
  const [me] = await db
    .select({ handle: schema.users.handle, displayName: schema.users.displayName })
    .from(schema.users)
    .where(eq(schema.users.id, session.user.id))
    .limit(1)
  const rows = await db
    .select()
    .from(schema.userLists)
    .where(eq(schema.userLists.ownerId, session.user.id))
    .orderBy(desc(schema.userLists.createdAt))
  return c.json({
    lists: rows.map((l) => toListDto(l, me?.handle ?? null, me?.displayName ?? null)),
  })
})

listsRoute.post('/', requireAuth(), async (c) => {
  const session = c.get('session')!
  const { db } = c.get('ctx')
  const body = createListSchema.parse(await c.req.json())

  const [me] = await db
    .select({ handle: schema.users.handle, displayName: schema.users.displayName })
    .from(schema.users)
    .where(eq(schema.users.id, session.user.id))
    .limit(1)

  try {
    const [row] = await db
      .insert(schema.userLists)
      .values({
        ownerId: session.user.id,
        slug: body.slug,
        title: body.title,
        description: body.description ?? null,
        isPrivate: body.isPrivate,
      })
      .returning()
    if (!row) return c.json({ error: 'insert_failed' }, 500)
    return c.json({ list: toListDto(row, me?.handle ?? null, me?.displayName ?? null) }, 201)
  } catch (err) {
    const message = err instanceof Error ? err.message : ''
    if (message.includes('user_lists_owner_slug_uq')) {
      return c.json({ error: 'slug_taken' }, 409)
    }
    throw err
  }
})

listsRoute.get('/:id', async (c) => {
  const { db } = c.get('ctx')
  const viewerId = c.get('session')?.user.id
  const id = c.req.param('id')
  const [list] = await db
    .select({
      list: schema.userLists,
      handle: schema.users.handle,
      displayName: schema.users.displayName,
    })
    .from(schema.userLists)
    .innerJoin(schema.users, eq(schema.users.id, schema.userLists.ownerId))
    .where(eq(schema.userLists.id, id))
    .limit(1)
  if (!list) return c.json({ error: 'not_found' }, 404)
  if (list.list.isPrivate && viewerId !== list.list.ownerId) {
    return c.json({ error: 'not_found' }, 404)
  }
  return c.json({ list: toListDto(list.list, list.handle, list.displayName) })
})

listsRoute.patch('/:id', requireAuth(), async (c) => {
  const session = c.get('session')!
  const { db } = c.get('ctx')
  const id = c.req.param('id')
  const body = updateListSchema.parse(await c.req.json())

  const patch: Partial<typeof schema.userLists.$inferInsert> = { updatedAt: new Date() }
  if (body.title !== undefined) patch.title = body.title
  if (body.description !== undefined) patch.description = body.description ?? null
  if (body.isPrivate !== undefined) patch.isPrivate = body.isPrivate

  const [row] = await db
    .update(schema.userLists)
    .set(patch)
    .where(and(eq(schema.userLists.id, id), eq(schema.userLists.ownerId, session.user.id)))
    .returning()
  if (!row) return c.json({ error: 'not_found' }, 404)

  const [me] = await db
    .select({ handle: schema.users.handle, displayName: schema.users.displayName })
    .from(schema.users)
    .where(eq(schema.users.id, session.user.id))
    .limit(1)
  return c.json({ list: toListDto(row, me?.handle ?? null, me?.displayName ?? null) })
})

listsRoute.delete('/:id', requireAuth(), async (c) => {
  const session = c.get('session')!
  const { db } = c.get('ctx')
  const id = c.req.param('id')
  await db
    .delete(schema.userLists)
    .where(and(eq(schema.userLists.id, id), eq(schema.userLists.ownerId, session.user.id)))
  return c.json({ ok: true })
})

// Members: list, add, remove. Add accepts an array of user ids.
listsRoute.get('/:id/members', async (c) => {
  const { db, mediaEnv } = c.get('ctx')
  const viewerId = c.get('session')?.user.id
  const id = c.req.param('id')
  const [list] = await db.select().from(schema.userLists).where(eq(schema.userLists.id, id)).limit(1)
  if (!list) return c.json({ error: 'not_found' }, 404)
  if (list.isPrivate && viewerId !== list.ownerId) return c.json({ error: 'not_found' }, 404)

  const rows = await db
    .select({ user: schema.users, addedAt: schema.userListMembers.addedAt })
    .from(schema.userListMembers)
    .innerJoin(schema.users, eq(schema.users.id, schema.userListMembers.memberId))
    .where(and(eq(schema.userListMembers.listId, id), isNull(schema.users.deletedAt)))
    .orderBy(asc(schema.userListMembers.addedAt))

  return c.json({
    members: rows.map((r) => ({
      id: r.user.id,
      handle: r.user.handle,
      displayName: r.user.displayName,
      avatarUrl: assetUrl(mediaEnv, r.user.avatarUrl),
      isVerified: r.user.isVerified,
      addedAt: r.addedAt.toISOString(),
    })),
  })
})

listsRoute.post('/:id/members', requireAuth(), async (c) => {
  const session = c.get('session')!
  const { db } = c.get('ctx')
  const id = c.req.param('id')
  const body = await c.req.json().catch(() => ({}))
  const userIds: Array<string> = Array.isArray(body?.userIds) ? body.userIds : []
  if (userIds.length === 0) return c.json({ error: 'no_users' }, 400)
  if (userIds.length > 50) return c.json({ error: 'too_many' }, 400)

  return await db.transaction(async (tx) => {
    const [list] = await tx
      .select()
      .from(schema.userLists)
      .where(eq(schema.userLists.id, id))
      .limit(1)
    if (!list) return c.json({ error: 'not_found' }, 404)
    if (list.ownerId !== session.user.id) return c.json({ error: 'forbidden' }, 403)

    const existing = await tx
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(and(inArray(schema.users.id, userIds), isNull(schema.users.deletedAt)))
    const validIds = existing.map((u) => u.id)
    if (validIds.length === 0) return c.json({ ok: true, added: 0 })

    const inserted = await tx
      .insert(schema.userListMembers)
      .values(validIds.map((memberId) => ({ listId: id, memberId })))
      .onConflictDoNothing()
      .returning({ memberId: schema.userListMembers.memberId })

    if (inserted.length > 0) {
      await tx
        .update(schema.userLists)
        .set({ memberCount: sql`${schema.userLists.memberCount} + ${inserted.length}`, updatedAt: new Date() })
        .where(eq(schema.userLists.id, id))
    }
    return c.json({ ok: true, added: inserted.length })
  })
})

listsRoute.delete('/:id/members/:memberId', requireAuth(), async (c) => {
  const session = c.get('session')!
  const { db } = c.get('ctx')
  const id = c.req.param('id')
  const memberId = c.req.param('memberId')

  return await db.transaction(async (tx) => {
    const [list] = await tx
      .select()
      .from(schema.userLists)
      .where(eq(schema.userLists.id, id))
      .limit(1)
    if (!list) return c.json({ error: 'not_found' }, 404)
    if (list.ownerId !== session.user.id) return c.json({ error: 'forbidden' }, 403)

    const removed = await tx
      .delete(schema.userListMembers)
      .where(
        and(eq(schema.userListMembers.listId, id), eq(schema.userListMembers.memberId, memberId)),
      )
      .returning({ memberId: schema.userListMembers.memberId })
    if (removed.length > 0) {
      await tx
        .update(schema.userLists)
        .set({
          memberCount: sql`GREATEST(${schema.userLists.memberCount} - 1, 0)`,
          updatedAt: new Date(),
        })
        .where(eq(schema.userLists.id, id))
    }
    return c.json({ ok: true })
  })
})

// Timeline: posts from list members. Mirrors the home feed shape so the web client can reuse
// the Feed component.
listsRoute.get('/:id/timeline', async (c) => {
  const { db, mediaEnv } = c.get('ctx')
  const viewerId = c.get('session')?.user.id
  const id = c.req.param('id')
  const limit = Math.min(Number(c.req.query('limit') ?? 40), 100)
  const cursor = parseCursor(c.req.query('cursor'))

  const [list] = await db.select().from(schema.userLists).where(eq(schema.userLists.id, id)).limit(1)
  if (!list) return c.json({ error: 'not_found' }, 404)
  if (list.isPrivate && viewerId !== list.ownerId) return c.json({ error: 'not_found' }, 404)

  const rows = await db
    .select({ post: schema.posts, author: schema.users })
    .from(schema.userListMembers)
    .innerJoin(schema.posts, eq(schema.posts.authorId, schema.userListMembers.memberId))
    .innerJoin(schema.users, eq(schema.users.id, schema.posts.authorId))
    .where(
      and(
        eq(schema.userListMembers.listId, id),
        isNull(schema.posts.deletedAt),
        eq(schema.posts.visibility, 'public'),
        cursor ? lt(schema.posts.createdAt, cursor) : undefined,
      ),
    )
    .orderBy(desc(schema.posts.createdAt))
    .limit(limit)

  const ids = rows.map((r) => r.post.id)
  const [flags, mediaMap, articleMap, repostMap, quoteMap, pollMap] = await Promise.all([
    loadViewerFlags(db, viewerId, ids),
    loadPostMedia(db, ids),
    loadArticleCards(db, ids),
    loadRepostTargets({
      db,
      viewerId,
      env: mediaEnv,
      repostRows: rows.map((r) => ({ id: r.post.id, repostOfId: r.post.repostOfId })),
    }),
    loadQuoteTargets({
      db,
      viewerId,
      env: mediaEnv,
      quoteRows: rows.map((r) => ({ id: r.post.id, quoteOfId: r.post.quoteOfId })),
    }),
    loadPolls(db, viewerId, ids),
  ])
  const posts = rows.map((r) =>
    toPostDto(
      r.post,
      r.author,
      flags.get(r.post.id),
      mediaMap.get(r.post.id),
      mediaEnv,
      articleMap.get(r.post.id),
      repostMap.get(r.post.id),
      quoteMap.get(r.post.id),
      pollMap.get(r.post.id),
    ),
  )
  const nextCursor = posts.length === limit ? posts[posts.length - 1]!.createdAt : null
  return c.json({ posts, nextCursor })
})

function toListDto(
  l: typeof schema.userLists.$inferSelect,
  ownerHandle: string | null,
  ownerDisplayName: string | null,
): ListDto {
  return {
    id: l.id,
    ownerId: l.ownerId,
    ownerHandle,
    ownerDisplayName,
    slug: l.slug,
    title: l.title,
    description: l.description,
    isPrivate: l.isPrivate,
    memberCount: l.memberCount,
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
  }
}
