import { Hono, type Context } from 'hono'
import { z } from 'zod'
import { and, desc, eq, ilike, or, sql } from '@workspace/db'
import { schema } from '@workspace/db'
import { assetUrl } from '@workspace/media/s3'
import { requireAdmin, requireOwner, type HonoEnv, type Role } from '../middleware/session.ts'
import { parseCursor } from '../lib/cursor.ts'

export const adminRoute = new Hono<HonoEnv>()

// Every endpoint here requires admin or owner. Owner-only operations layer on requireOwner().
adminRoute.use('*', requireAdmin())

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
