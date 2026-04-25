import { Hono, type Context } from 'hono'
import { z } from 'zod'
import { and, desc, eq, gte, ilike, or, sql } from '@workspace/db'
import { schema } from '@workspace/db'
import { assetUrl } from '@workspace/media/s3'
import { handleSchema } from '@workspace/validators'
import { requireAdmin, requireOwner, type HonoEnv, type Role } from '../middleware/session.ts'
import { parseCursor } from '../lib/cursor.ts'
import { isReservedHandle } from '../lib/handles.ts'

export const adminRoute = new Hono<HonoEnv>()

// Every endpoint here requires admin or owner. Owner-only operations layer on requireOwner().
adminRoute.use('*', requireAdmin())

// Aggregate counters for the admin dashboard stat cards. Single round-trip; each branch is a
// partial-index-friendly count(*) so it stays fast even at scale. `active` excludes banned,
// shadowbanned, and deleted users so the four moderation buckets sum to the total.
adminRoute.get('/stats', async (c) => {
  const { db } = c.get('ctx')
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      active: sql<number>`count(*) filter (where ${schema.users.banned} = false and ${schema.users.shadowBannedAt} is null and ${schema.users.deletedAt} is null)::int`,
      banned: sql<number>`count(*) filter (where ${schema.users.banned} = true)::int`,
      shadowBanned: sql<number>`count(*) filter (where ${schema.users.shadowBannedAt} is not null)::int`,
      deleted: sql<number>`count(*) filter (where ${schema.users.deletedAt} is not null)::int`,
      verified: sql<number>`count(*) filter (where ${schema.users.isVerified} = true)::int`,
      admins: sql<number>`count(*) filter (where ${schema.users.role} in ('admin','owner'))::int`,
      newToday: sql<number>`count(*) filter (where ${gte(schema.users.createdAt, dayAgo)})::int`,
      newThisWeek: sql<number>`count(*) filter (where ${gte(schema.users.createdAt, weekAgo)})::int`,
    })
    .from(schema.users)

  const [reportRow] = await db
    .select({
      openReports: sql<number>`count(*) filter (where ${schema.reports.status} = 'open')::int`,
    })
    .from(schema.reports)

  return c.json({
    users: {
      total: row?.total ?? 0,
      active: row?.active ?? 0,
      banned: row?.banned ?? 0,
      shadowBanned: row?.shadowBanned ?? 0,
      deleted: row?.deleted ?? 0,
      verified: row?.verified ?? 0,
      admins: row?.admins ?? 0,
      newToday: row?.newToday ?? 0,
      newThisWeek: row?.newThisWeek ?? 0,
    },
    reports: {
      open: reportRow?.openReports ?? 0,
    },
  })
})

const listQuery = z.object({
  // Cap admin search input. Without a limit, an admin (or compromised admin session) can
  // ship a massive `q` and force the planner into a wildcard ilike scan. 80 chars matches
  // the public search cap.
  q: z.string().trim().max(80).optional(),
  cursor: z.string().max(40).optional(),
  limit: z.coerce.number().min(1).max(100).default(40),
})

// List/search users. Cursor is the ISO timestamp of the previous page's last createdAt.
adminRoute.get('/users', async (c) => {
  const { db, mediaEnv } = c.get('ctx')
  const { q, cursor, limit } = listQuery.parse(c.req.query())

  const filters: Array<unknown> = []
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`
    filters.push(or(ilike(schema.users.email, like), ilike(schema.users.handle, like)))
  }
  const parsedCursor = parseCursor(cursor)
  if (parsedCursor) filters.push(sql`${schema.users.createdAt} < ${parsedCursor}`)

  const rows = await db
    .select()
    .from(schema.users)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .where(filters.length > 0 ? (and(...(filters as Array<any>)) as any) : undefined)
    .orderBy(desc(schema.users.createdAt))
    .limit(limit)

  const items = rows.map((u) => ({
    id: u.id,
    email: u.email,
    handle: u.handle,
    displayName: u.displayName,
    avatarUrl: assetUrl(mediaEnv, u.avatarUrl),
    role: u.role as Role,
    banned: u.banned,
    banReason: u.banReason,
    banExpires: u.banExpires?.toISOString() ?? null,
    shadowBannedAt: u.shadowBannedAt?.toISOString() ?? null,
    isVerified: u.isVerified,
    deletedAt: u.deletedAt?.toISOString() ?? null,
    createdAt: u.createdAt.toISOString(),
  }))
  const nextCursor =
    rows.length === limit ? rows[rows.length - 1]!.createdAt.toISOString() : null
  return c.json({ users: items, nextCursor })
})

// Detailed view: user + recent posts + open reports filed against them.
adminRoute.get('/users/:id', async (c) => {
  const { db, mediaEnv } = c.get('ctx')
  const id = c.req.param('id')

  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1)
  if (!user) return c.json({ error: 'not_found' }, 404)

  const [recentPosts, reports, recentActions] = await Promise.all([
    db
      .select()
      .from(schema.posts)
      .where(eq(schema.posts.authorId, id))
      .orderBy(desc(schema.posts.createdAt))
      .limit(20),
    db
      .select()
      .from(schema.reports)
      .where(and(eq(schema.reports.subjectType, 'user'), eq(schema.reports.subjectId, id)))
      .orderBy(desc(schema.reports.createdAt))
      .limit(20),
    db
      .select()
      .from(schema.moderationActions)
      .where(
        and(
          eq(schema.moderationActions.subjectType, 'user'),
          eq(schema.moderationActions.subjectId, id),
        ),
      )
      .orderBy(desc(schema.moderationActions.createdAt))
      .limit(20),
  ])

  return c.json({
    user: {
      id: user.id,
      email: user.email,
      handle: user.handle,
      displayName: user.displayName,
      bio: user.bio,
      avatarUrl: assetUrl(mediaEnv, user.avatarUrl),
      bannerUrl: assetUrl(mediaEnv, user.bannerUrl),
      role: user.role as Role,
      banned: user.banned,
      banReason: user.banReason,
      banExpires: user.banExpires?.toISOString() ?? null,
      shadowBannedAt: user.shadowBannedAt?.toISOString() ?? null,
      isVerified: user.isVerified,
      deletedAt: user.deletedAt?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
    },
    recentPosts: recentPosts.map((p) => ({
      id: p.id,
      text: p.text,
      createdAt: p.createdAt.toISOString(),
      deletedAt: p.deletedAt?.toISOString() ?? null,
      sensitive: p.sensitive,
      replyToId: p.replyToId,
    })),
    reports: reports.map((r) => ({
      id: r.id,
      reporterId: r.reporterId,
      reason: r.reason,
      details: r.details,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    })),
    actions: recentActions.map((a) => ({
      id: a.id,
      moderatorId: a.moderatorId,
      action: a.action,
      publicReason: a.publicReason,
      privateNote: a.privateNote,
      durationHours: a.durationHours,
      createdAt: a.createdAt.toISOString(),
    })),
  })
})

const banSchema = z.object({
  reason: z.string().trim().min(1).max(500).optional(),
  durationHours: z.number().int().positive().optional(),
})

// Ban a user. Sets the better-auth `banned` flag so the session middleware will treat them as
// logged out on the next request, and records the action in moderation_actions for audit.
adminRoute.post('/users/:id/ban', async (c) => {
  const session = c.get('session')!
  const { db } = c.get('ctx')
  const id = c.req.param('id')
  const body = banSchema.parse(await c.req.json().catch(() => ({})))

  if (id === session.user.id) return c.json({ error: 'cannot_ban_self' }, 400)
  // Owner-only protection: admins can't ban other admins or owners. Owner can ban anyone except self.
  await guardTargetRank(c, id)

  const expires = body.durationHours
    ? new Date(Date.now() + body.durationHours * 60 * 60 * 1000)
    : null

  await db.transaction(async (tx) => {
    await tx
      .update(schema.users)
      .set({ banned: true, banReason: body.reason ?? null, banExpires: expires })
      .where(eq(schema.users.id, id))
    // Wipe sessions so the user is kicked from any open tabs immediately.
    await tx.delete(schema.sessions).where(eq(schema.sessions.userId, id))
    await tx.insert(schema.moderationActions).values({
      moderatorId: session.user.id,
      subjectType: 'user',
      subjectId: id,
      action: body.durationHours ? 'suspend' : 'shadowban',
      publicReason: body.reason ?? null,
      durationHours: body.durationHours ?? null,
    })
  })

  return c.json({ ok: true })
})

adminRoute.post('/users/:id/unban', async (c) => {
  const session = c.get('session')!
  const { db } = c.get('ctx')
  const id = c.req.param('id')

  await db.transaction(async (tx) => {
    await tx
      .update(schema.users)
      .set({ banned: false, banReason: null, banExpires: null })
      .where(eq(schema.users.id, id))
    await tx.insert(schema.moderationActions).values({
      moderatorId: session.user.id,
      subjectType: 'user',
      subjectId: id,
      action: 'unban',
    })
  })
  return c.json({ ok: true })
})

const shadowSchema = z.object({
  reason: z.string().trim().min(1).max(500).optional(),
})

// Shadowban: their content stays visible to them but hidden from everyone else. No session wipe.
adminRoute.post('/users/:id/shadowban', async (c) => {
  const session = c.get('session')!
  const { db } = c.get('ctx')
  const id = c.req.param('id')
  const body = shadowSchema.parse(await c.req.json().catch(() => ({})))

  if (id === session.user.id) return c.json({ error: 'cannot_shadowban_self' }, 400)
  await guardTargetRank(c, id)

  await db.transaction(async (tx) => {
    await tx
      .update(schema.users)
      .set({ shadowBannedAt: new Date() })
      .where(eq(schema.users.id, id))
    await tx.insert(schema.moderationActions).values({
      moderatorId: session.user.id,
      subjectType: 'user',
      subjectId: id,
      action: 'shadowban',
      publicReason: body.reason ?? null,
    })
  })
  return c.json({ ok: true })
})

adminRoute.post('/users/:id/unshadowban', async (c) => {
  const session = c.get('session')!
  const { db } = c.get('ctx')
  const id = c.req.param('id')

  await db.transaction(async (tx) => {
    await tx
      .update(schema.users)
      .set({ shadowBannedAt: null })
      .where(eq(schema.users.id, id))
    await tx.insert(schema.moderationActions).values({
      moderatorId: session.user.id,
      subjectType: 'user',
      subjectId: id,
      action: 'unban',
    })
  })
  return c.json({ ok: true })
})

const roleSchema = z.object({ role: z.enum(['user', 'admin', 'owner']) })

// Owner-only: assign roles. Admins can't promote/demote anyone.
adminRoute.post('/users/:id/role', requireOwner(), async (c) => {
  const session = c.get('session')!
  const { db } = c.get('ctx')
  const id = c.req.param('id')
  const { role } = roleSchema.parse(await c.req.json())
  if (id === session.user.id) return c.json({ error: 'cannot_change_own_role' }, 400)

  await db.update(schema.users).set({ role }).where(eq(schema.users.id, id))
  await db.insert(schema.moderationActions).values({
    moderatorId: session.user.id,
    subjectType: 'user',
    subjectId: id,
    action: 'warn',
    privateNote: `role -> ${role}`,
  })
  return c.json({ ok: true })
})

const reportsQuery = z.object({
  status: z.enum(['open', 'triaged', 'actioned', 'dismissed']).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(40),
})

adminRoute.get('/reports', async (c) => {
  const { db, mediaEnv } = c.get('ctx')
  const { status, cursor, limit } = reportsQuery.parse(c.req.query())

  const filters: Array<unknown> = []
  if (status) filters.push(eq(schema.reports.status, status))
  const parsedCursor = parseCursor(cursor)
  if (parsedCursor) filters.push(sql`${schema.reports.createdAt} < ${parsedCursor}`)

  const rows = await db
    .select({ report: schema.reports, reporter: schema.users })
    .from(schema.reports)
    .leftJoin(schema.users, eq(schema.users.id, schema.reports.reporterId))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .where(filters.length > 0 ? (and(...(filters as Array<any>)) as any) : undefined)
    .orderBy(desc(schema.reports.createdAt))
    .limit(limit)

  const items = rows.map((r) => ({
    id: r.report.id,
    subjectType: r.report.subjectType,
    subjectId: r.report.subjectId,
    reason: r.report.reason,
    details: r.report.details,
    status: r.report.status,
    createdAt: r.report.createdAt.toISOString(),
    resolvedAt: r.report.resolvedAt?.toISOString() ?? null,
    reporter: r.reporter
      ? {
          id: r.reporter.id,
          handle: r.reporter.handle,
          displayName: r.reporter.displayName,
          avatarUrl: assetUrl(mediaEnv, r.reporter.avatarUrl),
        }
      : null,
  }))
  const nextCursor =
    rows.length === limit ? rows[rows.length - 1]!.report.createdAt.toISOString() : null
  return c.json({ reports: items, nextCursor })
})

adminRoute.get('/reports/:id', async (c) => {
  const { db, mediaEnv } = c.get('ctx')
  const id = c.req.param('id')

  const [row] = await db
    .select({ report: schema.reports, reporter: schema.users })
    .from(schema.reports)
    .leftJoin(schema.users, eq(schema.users.id, schema.reports.reporterId))
    .where(eq(schema.reports.id, id))
    .limit(1)

  if (!row) return c.json({ error: 'not_found' }, 404)

  const r = row.report
  const reporter = row.reporter

  let subject:
    | {
        type: 'post'
        post: {
          id: string
          text: string
          sensitive: boolean
          contentWarning: string | null
          createdAt: string
          deletedAt: string | null
          author: {
            id: string
            handle: string | null
            displayName: string | null
            avatarUrl: string | null
          } | null
        }
      }
    | {
        type: 'user'
        user: {
          id: string
          handle: string | null
          displayName: string | null
          avatarUrl: string | null
          banned: boolean
        }
      }
    | { type: 'unknown'; subjectType: string; subjectId: string }
    | null = null

  if (r.subjectType === 'post') {
    const [postRow] = await db
      .select({ post: schema.posts, author: schema.users })
      .from(schema.posts)
      .leftJoin(schema.users, eq(schema.users.id, schema.posts.authorId))
      .where(eq(schema.posts.id, r.subjectId))
      .limit(1)
    if (postRow) {
      subject = {
        type: 'post',
        post: {
          id: postRow.post.id,
          text: postRow.post.text,
          sensitive: postRow.post.sensitive,
          contentWarning: postRow.post.contentWarning,
          createdAt: postRow.post.createdAt.toISOString(),
          deletedAt: postRow.post.deletedAt?.toISOString() ?? null,
          author: postRow.author
            ? {
                id: postRow.author.id,
                handle: postRow.author.handle,
                displayName: postRow.author.displayName,
                avatarUrl: assetUrl(mediaEnv, postRow.author.avatarUrl),
              }
            : null,
        },
      }
    }
  } else if (r.subjectType === 'user') {
    const [u] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, r.subjectId))
      .limit(1)
    if (u) {
      subject = {
        type: 'user',
        user: {
          id: u.id,
          handle: u.handle,
          displayName: u.displayName,
          avatarUrl: assetUrl(mediaEnv, u.avatarUrl),
          banned: u.banned,
        },
      }
    }
  } else {
    subject = { type: 'unknown', subjectType: r.subjectType, subjectId: r.subjectId }
  }

  return c.json({
    id: r.id,
    subjectType: r.subjectType,
    subjectId: r.subjectId,
    reason: r.reason,
    details: r.details,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    resolvedAt: r.resolvedAt?.toISOString() ?? null,
    resolutionNote: r.resolutionNote,
    reporter: reporter
      ? {
          id: reporter.id,
          handle: reporter.handle,
          displayName: reporter.displayName,
          avatarUrl: assetUrl(mediaEnv, reporter.avatarUrl),
        }
      : null,
    subject,
  })
})

const resolveSchema = z.object({
  status: z.enum(['triaged', 'actioned', 'dismissed']),
  resolutionNote: z.string().trim().max(1000).optional(),
})

adminRoute.patch('/reports/:id', async (c) => {
  const session = c.get('session')!
  const { db } = c.get('ctx')
  const id = c.req.param('id')
  const body = resolveSchema.parse(await c.req.json())

  await db
    .update(schema.reports)
    .set({
      status: body.status,
      resolutionNote: body.resolutionNote ?? null,
      assignedToId: session.user.id,
      resolvedAt: new Date(),
    })
    .where(eq(schema.reports.id, id))
  return c.json({ ok: true })
})

const verifySchema = z.object({
  reason: z.string().trim().min(1).max(500).optional(),
})

// Grant a verified badge. Idempotent — re-running on an already-verified user just records
// another audit entry. Uses the existing `warn` mod action with a privateNote so we don't
// have to extend the mod_action enum (and its DB migration) for a one-bit flag toggle.
adminRoute.post('/users/:id/verify', async (c) => {
  const session = c.get('session')!
  const { db } = c.get('ctx')
  const id = c.req.param('id')
  const body = verifySchema.parse(await c.req.json().catch(() => ({})))

  await db.transaction(async (tx) => {
    await tx.update(schema.users).set({ isVerified: true }).where(eq(schema.users.id, id))
    await tx.insert(schema.moderationActions).values({
      moderatorId: session.user.id,
      subjectType: 'user',
      subjectId: id,
      action: 'warn',
      privateNote: `verify_grant${body.reason ? `: ${body.reason}` : ''}`,
    })
  })
  return c.json({ ok: true })
})

adminRoute.post('/users/:id/unverify', async (c) => {
  const session = c.get('session')!
  const { db } = c.get('ctx')
  const id = c.req.param('id')
  const body = verifySchema.parse(await c.req.json().catch(() => ({})))

  await db.transaction(async (tx) => {
    await tx.update(schema.users).set({ isVerified: false }).where(eq(schema.users.id, id))
    await tx.insert(schema.moderationActions).values({
      moderatorId: session.user.id,
      subjectType: 'user',
      subjectId: id,
      action: 'warn',
      privateNote: `verify_revoke${body.reason ? `: ${body.reason}` : ''}`,
    })
  })
  return c.json({ ok: true })
})

const setHandleSchema = z.object({
  handle: handleSchema,
  reason: z.string().trim().min(1).max(500).optional(),
})

// Owner-only: forcibly reassign a user's handle. Useful for reclaiming squatted handles or
// resolving impersonation reports. The handle is freed atomically — if the new handle is
// taken or reserved we 4xx without touching the row.
adminRoute.post('/users/:id/handle', requireOwner(), async (c) => {
  const session = c.get('session')!
  const { db } = c.get('ctx')
  const id = c.req.param('id')
  const { handle, reason } = setHandleSchema.parse(await c.req.json())
  const normalized = handle.toLowerCase()

  if (isReservedHandle(normalized)) return c.json({ error: 'reserved_handle' }, 400)

  const [target] = await db
    .select({ handle: schema.users.handle })
    .from(schema.users)
    .where(eq(schema.users.id, id))
    .limit(1)
  if (!target) return c.json({ error: 'not_found' }, 404)

  // citext column ⇒ case-insensitive comparison. Allow rewriting to the same handle with a
  // different case (e.g. fix capitalisation), but skip the conflict check in that case.
  if (target.handle?.toLowerCase() !== normalized) {
    const existing = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.handle, handle))
      .limit(1)
    if (existing.length > 0) return c.json({ error: 'handle_taken' }, 409)
  }

  await db.transaction(async (tx) => {
    await tx
      .update(schema.users)
      .set({ handle, updatedAt: new Date() })
      .where(eq(schema.users.id, id))
    await tx.insert(schema.moderationActions).values({
      moderatorId: session.user.id,
      subjectType: 'user',
      subjectId: id,
      action: 'warn',
      privateNote: `handle_change: ${target.handle ?? '∅'} -> ${handle}${reason ? ` (${reason})` : ''}`,
    })
  })
  return c.json({ ok: true })
})

// Soft-delete a post via mod action. Distinct from author delete: records who/why for audit.
adminRoute.delete('/posts/:id', async (c) => {
  const session = c.get('session')!
  const { db } = c.get('ctx')
  const id = c.req.param('id')
  const body = (await c.req.json().catch(() => ({}))) as { reason?: string; reportId?: string }

  await db.transaction(async (tx) => {
    await tx
      .update(schema.posts)
      .set({ deletedAt: new Date() })
      .where(eq(schema.posts.id, id))
    await tx.insert(schema.moderationActions).values({
      moderatorId: session.user.id,
      subjectType: 'post',
      subjectId: id,
      action: 'delete',
      publicReason: body.reason ?? null,
      reportId: body.reportId ?? null,
    })
  })
  return c.json({ ok: true })
})

const deleteUserSchema = z.object({
  reason: z.string().trim().min(1).max(500).optional(),
})

// Owner-only: soft-delete a user account. Sets deletedAt so the user disappears from feeds,
// profile lookups, and search (every read path filters on isNull(deletedAt)). Sessions are
// wiped so the account is logged out everywhere on the next request. Reversible by clearing
// deletedAt directly in the DB if needed.
adminRoute.delete('/users/:id', requireOwner(), async (c) => {
  const session = c.get('session')!
  const { db } = c.get('ctx')
  const id = c.req.param('id')
  const body = deleteUserSchema.parse(await c.req.json().catch(() => ({})))

  if (id === session.user.id) return c.json({ error: 'cannot_delete_self' }, 400)

  const [target] = await db
    .select({ deletedAt: schema.users.deletedAt })
    .from(schema.users)
    .where(eq(schema.users.id, id))
    .limit(1)
  if (!target) return c.json({ error: 'not_found' }, 404)
  if (target.deletedAt) return c.json({ error: 'already_deleted' }, 409)

  await db.transaction(async (tx) => {
    await tx
      .update(schema.users)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.users.id, id))
    await tx.delete(schema.sessions).where(eq(schema.sessions.userId, id))
    await tx.insert(schema.moderationActions).values({
      moderatorId: session.user.id,
      subjectType: 'user',
      subjectId: id,
      action: 'delete',
      publicReason: body.reason ?? null,
    })
  })
  return c.json({ ok: true })
})

// Prevent admins from acting on other admins or owners. Owners can act on anyone (except self,
// which is checked separately in the caller).
async function guardTargetRank(c: Context<HonoEnv>, targetId: string) {
  const session = c.get('session')!
  const { db } = c.get('ctx')
  if (session.user.role === 'owner') return
  const [target] = await db
    .select({ role: schema.users.role })
    .from(schema.users)
    .where(eq(schema.users.id, targetId))
    .limit(1)
  if (!target) return
  if (target.role === 'admin' || target.role === 'owner') {
    throw new ForbiddenError('admins cannot act on other admins or owners')
  }
}

class ForbiddenError extends Error {}
adminRoute.onError((err, c) => {
  if (err instanceof ForbiddenError) return c.json({ error: 'forbidden', message: err.message }, 403)
  throw err
})
