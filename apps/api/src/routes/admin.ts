import { Hono, type Context } from 'hono'
import { z } from 'zod'
import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
} from '@workspace/db'
import { schema } from '@workspace/db'
import { assetUrl } from '@workspace/media/s3'
import { adminSetUserHandleSchema } from '@workspace/validators'
import { requireAdmin, requireOwner, type HonoEnv, type Role } from '../middleware/session.ts'
import { parseCursor } from '../lib/cursor.ts'
import { isReservedHandle } from '../lib/handles.ts'
import { getOnlineCount, getOnlineUserIds } from '../lib/presence.ts'

export const adminRoute = new Hono<HonoEnv>()

// Every endpoint here requires admin or owner. Owner-only operations layer on requireOwner().
adminRoute.use('*', requireAdmin())

// Aggregate counters for the admin dashboard stat cards. All groups run in parallel as a
// single Promise.all; within each query every branch is a partial-index-friendly count(*)
// filter so we get a wide picture from a small number of round-trips. `active` users excludes
// banned, shadowbanned, and deleted users so the four moderation buckets sum to the total.
adminRoute.get('/stats', async (c) => {
  const { db } = c.get('ctx')
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const [userRows, reportRows, postRows, engagementRows, socialRows, messagingRows] =
    await Promise.all([
      db
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
        .from(schema.users),
      db
        .select({
          open: sql<number>`count(*) filter (where ${schema.reports.status} = 'open')::int`,
          triaged: sql<number>`count(*) filter (where ${schema.reports.status} = 'triaged')::int`,
          actioned: sql<number>`count(*) filter (where ${schema.reports.status} = 'actioned')::int`,
          dismissed: sql<number>`count(*) filter (where ${schema.reports.status} = 'dismissed')::int`,
          total: sql<number>`count(*)::int`,
        })
        .from(schema.reports),
      // Posts taxonomy: replies, reposts, and quotes are all rows in `posts` distinguished by
      // the foreign keys they set. `original` excludes all three so the buckets partition the
      // (non-deleted) total. Impressions/likes/reposts/bookmarks/replies are summed off the
      // counter columns on the post row so we don't have to scan likes/bookmarks tables.
      db
        .select({
          total: sql<number>`count(*) filter (where ${schema.posts.deletedAt} is null)::int`,
          deleted: sql<number>`count(*) filter (where ${schema.posts.deletedAt} is not null)::int`,
          original: sql<number>`count(*) filter (where ${schema.posts.deletedAt} is null and ${schema.posts.replyToId} is null and ${schema.posts.repostOfId} is null and ${schema.posts.quoteOfId} is null)::int`,
          replies: sql<number>`count(*) filter (where ${schema.posts.deletedAt} is null and ${schema.posts.replyToId} is not null)::int`,
          reposts: sql<number>`count(*) filter (where ${schema.posts.deletedAt} is null and ${schema.posts.repostOfId} is not null)::int`,
          quotes: sql<number>`count(*) filter (where ${schema.posts.deletedAt} is null and ${schema.posts.quoteOfId} is not null)::int`,
          sensitive: sql<number>`count(*) filter (where ${schema.posts.deletedAt} is null and ${schema.posts.sensitive} = true)::int`,
          edited: sql<number>`count(*) filter (where ${schema.posts.deletedAt} is null and ${schema.posts.editedAt} is not null)::int`,
          newToday: sql<number>`count(*) filter (where ${gte(schema.posts.createdAt, dayAgo)} and ${schema.posts.deletedAt} is null)::int`,
          newThisWeek: sql<number>`count(*) filter (where ${gte(schema.posts.createdAt, weekAgo)} and ${schema.posts.deletedAt} is null)::int`,
          // Impressions live only on the post row (no relation table to sum from). bigint cast
          // keeps us safe past 2.1B aggregate impressions; ::text preserves precision in
          // transit (sum() returns numeric in PG) and we parse back to Number client-side.
          totalImpressions: sql<string>`coalesce(sum(${schema.posts.impressionCount}) filter (where ${schema.posts.deletedAt} is null), 0)::bigint::text`,
        })
        .from(schema.posts),
      // Counts off the relation tables for canonical totals (the post-counter sums above
      // double-count if a post is both repost and quote, etc.). These are partial-index
      // friendly count(*) queries on small composite keys.
      Promise.all([
        db.select({ count: sql<number>`count(*)::int` }).from(schema.likes),
        db.select({ count: sql<number>`count(*)::int` }).from(schema.bookmarks),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(schema.likes)
          .where(gte(schema.likes.createdAt, dayAgo)),
      ]).then(([likes, bookmarks, likesToday]) => ({
        likes: likes[0]?.count ?? 0,
        bookmarks: bookmarks[0]?.count ?? 0,
        likesToday: likesToday[0]?.count ?? 0,
      })),
      Promise.all([
        db.select({ count: sql<number>`count(*)::int` }).from(schema.follows),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(schema.follows)
          .where(gte(schema.follows.createdAt, dayAgo)),
        db.select({ count: sql<number>`count(*)::int` }).from(schema.blocks),
        db.select({ count: sql<number>`count(*)::int` }).from(schema.mutes),
      ]).then(([follows, followsToday, blocks, mutes]) => ({
        follows: follows[0]?.count ?? 0,
        followsToday: followsToday[0]?.count ?? 0,
        blocks: blocks[0]?.count ?? 0,
        mutes: mutes[0]?.count ?? 0,
      })),
      Promise.all([
        db.select({ count: sql<number>`count(*)::int` }).from(schema.conversations),
        db
          .select({ count: sql<number>`count(*) filter (where ${schema.messages.deletedAt} is null)::int` })
          .from(schema.messages),
      ]).then(([conversations, messages]) => ({
        conversations: conversations[0]?.count ?? 0,
        messages: messages[0]?.count ?? 0,
      })),
    ])

  const userRow = userRows[0]
  const reportRow = reportRows[0]
  const postRow = postRows[0]

  return c.json({
    users: {
      total: userRow?.total ?? 0,
      active: userRow?.active ?? 0,
      banned: userRow?.banned ?? 0,
      shadowBanned: userRow?.shadowBanned ?? 0,
      deleted: userRow?.deleted ?? 0,
      verified: userRow?.verified ?? 0,
      admins: userRow?.admins ?? 0,
      newToday: userRow?.newToday ?? 0,
      newThisWeek: userRow?.newThisWeek ?? 0,
    },
    posts: {
      total: postRow?.total ?? 0,
      original: postRow?.original ?? 0,
      replies: postRow?.replies ?? 0,
      reposts: postRow?.reposts ?? 0,
      quotes: postRow?.quotes ?? 0,
      deleted: postRow?.deleted ?? 0,
      sensitive: postRow?.sensitive ?? 0,
      edited: postRow?.edited ?? 0,
      newToday: postRow?.newToday ?? 0,
      newThisWeek: postRow?.newThisWeek ?? 0,
      // sum() returns numeric in PG; we cast to text to preserve precision in transit and
      // parse back to number client-side. JS number is safe up to 2^53 which covers any
      // realistic engagement total.
      totalImpressions: Number(postRow?.totalImpressions ?? 0),
    },
    engagement: {
      likes: engagementRows.likes,
      likesToday: engagementRows.likesToday,
      bookmarks: engagementRows.bookmarks,
      reposts: postRow?.reposts ?? 0,
      quotes: postRow?.quotes ?? 0,
      replies: postRow?.replies ?? 0,
    },
    social: {
      follows: socialRows.follows,
      followsToday: socialRows.followsToday,
      blocks: socialRows.blocks,
      mutes: socialRows.mutes,
    },
    messaging: {
      conversations: messagingRows.conversations,
      messages: messagingRows.messages,
    },
    reports: {
      total: reportRow?.total ?? 0,
      open: reportRow?.open ?? 0,
      triaged: reportRow?.triaged ?? 0,
      actioned: reportRow?.actioned ?? 0,
      dismissed: reportRow?.dismissed ?? 0,
    },
  })
})

// Live presence snapshot: how many users have an open, foregrounded tab right now plus a
// small sample of who they are. Backed by a Redis sorted set written by the /api/me
// heartbeat, so it costs one ZREMRANGEBYSCORE + ZCARD (+ ZREVRANGE + a small user lookup)
// per call — cheap enough to poll from the admin dashboard.
adminRoute.get('/online', async (c) => {
  const { db, mediaEnv, cache } = c.get('ctx')
  const count = await getOnlineCount(cache)
  const ids = count > 0 ? await getOnlineUserIds(cache, 12) : []
  let sample: Array<{
    id: string
    handle: string | null
    displayName: string | null
    avatarUrl: string | null
  }> = []
  if (ids.length > 0) {
    const rows = await db
      .select({
        id: schema.users.id,
        handle: schema.users.handle,
        displayName: schema.users.displayName,
        avatarUrl: schema.users.avatarUrl,
      })
      .from(schema.users)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .where(sql`${schema.users.id} = any(${ids as any})`)
    // Preserve the heartbeat-recency order from Redis; the SQL `IN` result is unordered.
    const byId = new Map(rows.map((r) => [r.id, r]))
    sample = ids
      .map((id) => byId.get(id))
      .filter((r): r is (typeof rows)[number] => Boolean(r))
      .map((r) => ({
        id: r.id,
        handle: r.handle,
        displayName: r.displayName,
        avatarUrl: assetUrl(mediaEnv, r.avatarUrl),
      }))
  }
  return c.json({ count, sample })
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
  if (parsedCursor) filters.push(lt(schema.users.createdAt, parsedCursor))

  const rows = await db
    .select()
    .from(schema.users)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .where(filters.length > 0 ? (and(...(filters as Array<any>)) as any) : undefined)
    .orderBy(desc(schema.users.createdAt))
    .limit(limit)

  const ids = rows.map((u) => u.id)
  let openReportsByUser = new Map<string, number>()
  let postsCountByUser = new Map<string, number>()
  let followersByUser = new Map<string, number>()
  let followingByUser = new Map<string, number>()
  if (ids.length > 0) {
    const [openReportsRows, postsRows, followerRows, followingRows] = await Promise.all([
      db
        .select({
          subjectId: schema.reports.subjectId,
          c: sql<number>`count(*)::int`,
        })
        .from(schema.reports)
        .where(
          and(
            eq(schema.reports.subjectType, 'user'),
            eq(schema.reports.status, 'open'),
            inArray(schema.reports.subjectId, ids),
          ),
        )
        .groupBy(schema.reports.subjectId),
      db
        .select({
          authorId: schema.posts.authorId,
          c: sql<number>`count(*)::int`,
        })
        .from(schema.posts)
        .where(and(isNull(schema.posts.deletedAt), inArray(schema.posts.authorId, ids)))
        .groupBy(schema.posts.authorId),
      db
        .select({
          followeeId: schema.follows.followeeId,
          c: sql<number>`count(*)::int`,
        })
        .from(schema.follows)
        .where(inArray(schema.follows.followeeId, ids))
        .groupBy(schema.follows.followeeId),
      db
        .select({
          followerId: schema.follows.followerId,
          c: sql<number>`count(*)::int`,
        })
        .from(schema.follows)
        .where(inArray(schema.follows.followerId, ids))
        .groupBy(schema.follows.followerId),
    ])
    openReportsByUser = new Map(openReportsRows.map((r) => [r.subjectId, r.c]))
    postsCountByUser = new Map(postsRows.map((r) => [r.authorId, r.c]))
    followersByUser = new Map(followerRows.map((r) => [r.followeeId, r.c]))
    followingByUser = new Map(followingRows.map((r) => [r.followerId, r.c]))
  }

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
    postsCount: postsCountByUser.get(u.id) ?? 0,
    followersCount: followersByUser.get(u.id) ?? 0,
    followingCount: followingByUser.get(u.id) ?? 0,
    openReportsCount: openReportsByUser.get(u.id) ?? 0,
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

  const [
    recentPosts,
    reports,
    recentActions,
    postsCountAgg,
    followersCountAgg,
    followingCountAgg,
    openReportsAgg,
    reportsTotalAgg,
  ] = await Promise.all([
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
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(schema.posts)
      .where(and(eq(schema.posts.authorId, id), isNull(schema.posts.deletedAt))),
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(schema.follows)
      .where(eq(schema.follows.followeeId, id)),
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(schema.follows)
      .where(eq(schema.follows.followerId, id)),
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(schema.reports)
      .where(
        and(
          eq(schema.reports.subjectType, 'user'),
          eq(schema.reports.subjectId, id),
          eq(schema.reports.status, 'open'),
        ),
      ),
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(schema.reports)
      .where(and(eq(schema.reports.subjectType, 'user'), eq(schema.reports.subjectId, id))),
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
      postsCount: postsCountAgg[0]?.c ?? 0,
      followersCount: followersCountAgg[0]?.c ?? 0,
      followingCount: followingCountAgg[0]?.c ?? 0,
      openReportsCount: openReportsAgg[0]?.c ?? 0,
      reportsTotalCount: reportsTotalAgg[0]?.c ?? 0,
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

  c.get('ctx').track('admin_user_banned', session.user.id)
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
  c.get('ctx').track('admin_user_unbanned', session.user.id)
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
  c.get('ctx').track('admin_user_shadowbanned', session.user.id)
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
  c.get('ctx').track('admin_user_unshadowbanned', session.user.id)
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
  c.get('ctx').track('admin_user_role_set', session.user.id, { role })
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
  if (parsedCursor) filters.push(lt(schema.reports.createdAt, parsedCursor))

  const rows = await db
    .select({ report: schema.reports, reporter: schema.users })
    .from(schema.reports)
    .leftJoin(schema.users, eq(schema.users.id, schema.reports.reporterId))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .where(filters.length > 0 ? (and(...(filters as Array<any>)) as any) : undefined)
    .orderBy(desc(schema.reports.createdAt))
    .limit(limit)

  const postSubjectIds = [
    ...new Set(rows.filter((r) => r.report.subjectType === 'post').map((r) => r.report.subjectId)),
  ]
  const userSubjectIds = [
    ...new Set(rows.filter((r) => r.report.subjectType === 'user').map((r) => r.report.subjectId)),
  ]

  const [postPreviewRows, userPreviewRows] = await Promise.all([
    postSubjectIds.length > 0
      ? db
          .select({
            id: schema.posts.id,
            text: schema.posts.text,
            handle: schema.users.handle,
          })
          .from(schema.posts)
          .leftJoin(schema.users, eq(schema.users.id, schema.posts.authorId))
          .where(inArray(schema.posts.id, postSubjectIds))
      : Promise.resolve(
          [] as Array<{ id: string; text: string; handle: string | null }>,
        ),
    userSubjectIds.length > 0
      ? db
          .select({
            id: schema.users.id,
            handle: schema.users.handle,
            displayName: schema.users.displayName,
          })
          .from(schema.users)
          .where(inArray(schema.users.id, userSubjectIds))
      : Promise.resolve(
          [] as Array<{
            id: string
            handle: string | null
            displayName: string | null
          }>,
        ),
  ])

  const postPrevById = new Map(postPreviewRows.map((p) => [p.id, p]))
  const userPrevById = new Map(userPreviewRows.map((u) => [u.id, u]))

  function previewSlice(text: string | null | undefined, max: number): string {
    const t = (text ?? "").replace(/\s+/g, " ").trim()
    if (t.length <= max) return t
    return `${t.slice(0, max)}…`
  }

  const items = rows.map((r) => {
    const rep = r.report
    let subjectPreview:
      | { kind: 'post'; authorHandle: string | null; textPreview: string }
      | { kind: 'user'; handle: string | null; displayName: string | null }
      | { kind: 'other'; subjectType: string }
    if (rep.subjectType === 'post') {
      const pr = postPrevById.get(rep.subjectId)
      subjectPreview = pr
        ? {
            kind: 'post',
            authorHandle: pr.handle,
            textPreview: previewSlice(pr.text, 120),
          }
        : { kind: 'other', subjectType: rep.subjectType }
    } else if (rep.subjectType === 'user') {
      const ur = userPrevById.get(rep.subjectId)
      subjectPreview = ur
        ? {
            kind: 'user',
            handle: ur.handle,
            displayName: ur.displayName,
          }
        : { kind: 'other', subjectType: rep.subjectType }
    } else {
      subjectPreview = { kind: 'other', subjectType: rep.subjectType }
    }

    return {
      id: rep.id,
      subjectType: rep.subjectType,
      subjectId: rep.subjectId,
      reason: rep.reason,
      details: rep.details,
      status: rep.status,
      createdAt: rep.createdAt.toISOString(),
      resolvedAt: rep.resolvedAt?.toISOString() ?? null,
      reporter: r.reporter
        ? {
            id: r.reporter.id,
            handle: r.reporter.handle,
            displayName: r.reporter.displayName,
            avatarUrl: assetUrl(mediaEnv, r.reporter.avatarUrl),
          }
        : null,
      subjectPreview,
    }
  })
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

  const linkedModerationActionsRows = await db
    .select()
    .from(schema.moderationActions)
    .where(eq(schema.moderationActions.reportId, id))
    .orderBy(desc(schema.moderationActions.createdAt))
    .limit(25)

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
    linkedModerationActions: linkedModerationActionsRows.map((a) => ({
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
  c.get('ctx').track('admin_report_resolved', session.user.id)
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
  c.get('ctx').track('admin_user_verified', session.user.id)
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
  c.get('ctx').track('admin_user_unverified', session.user.id)
  return c.json({ ok: true })
})

// Owner-only: forcibly reassign a user's handle. Useful for reclaiming squatted handles or
// resolving impersonation reports. The handle is freed atomically — if the new handle is
// taken or reserved we 4xx without touching the row.
adminRoute.post('/users/:id/handle', requireOwner(), async (c) => {
  const session = c.get('session')!
  const { db } = c.get('ctx')
  const id = c.req.param('id')
  const { handle, reason } =
    adminSetUserHandleSchema.parse(await c.req.json())
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
  c.get('ctx').track('admin_user_handle_set', session.user.id)
  return c.json({ ok: true })
})

const POST_SORTS = [
  'created',
  'likes',
  'reposts',
  'replies',
  'quotes',
  'bookmarks',
  'impressions',
] as const
type PostSort = (typeof POST_SORTS)[number]

const postsListQuery = z.object({
  q: z.string().trim().max(80).optional(),
  cursor: z.string().max(80).optional(),
  limit: z.coerce.number().min(1).max(100).default(40),
  sort: z.enum(POST_SORTS).default('created'),
  order: z.enum(['asc', 'desc']).default('desc'),
  type: z.enum(['any', 'original', 'reply', 'repost', 'quote']).default('any'),
  visibility: z.enum(['any', 'public', 'followers', 'unlisted']).default('any'),
  status: z.enum(['any', 'active', 'deleted', 'sensitive']).default('any'),
})

// Stat columns are integers (impressionCount is a bigint stored as number) and tie often, so
// the cursor encodes a `<value>~<uuid>` pair to give us a stable ordering. For the createdAt
// sort the value is the ISO timestamp; for stat sorts it's the numeric value. The post UUID
// is the deterministic tiebreaker.
function parsePostCursor(raw: string | undefined, sort: PostSort) {
  if (!raw) return undefined
  const sep = raw.indexOf('~')
  if (sep < 0) return undefined
  const value = raw.slice(0, sep)
  const id = raw.slice(sep + 1)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return undefined
  if (sort === 'created') {
    const date = parseCursor(value)
    if (!date) return undefined
    return { kind: 'date' as const, date, id }
  }
  if (!/^\d{1,20}$/.test(value)) return undefined
  const num = Number(value)
  if (!Number.isFinite(num) || num < 0) return undefined
  return { kind: 'number' as const, num, id }
}

function getCursorValue(
  sort: PostSort,
  last: {
    createdAt: Date
    likeCount: number
    repostCount: number
    replyCount: number
    quoteCount: number
    bookmarkCount: number
    impressionCount: number
  },
): string {
  switch (sort) {
    case 'created':
      return last.createdAt.toISOString()
    case 'likes':
      return String(last.likeCount)
    case 'reposts':
      return String(last.repostCount)
    case 'replies':
      return String(last.replyCount)
    case 'quotes':
      return String(last.quoteCount)
    case 'bookmarks':
      return String(last.bookmarkCount)
    case 'impressions':
      return String(last.impressionCount)
  }
}

// List/search posts with sort + filter for the admin panel. Joins author for the table cell.
// Pagination uses a `<value>~<uuid>` cursor for stable ordering when stat values tie.
adminRoute.get('/posts', async (c) => {
  const { db, mediaEnv } = c.get('ctx')
  const { q, cursor, limit, sort, order, type, visibility, status } = postsListQuery.parse(
    c.req.query(),
  )

  const sortColumns = {
    created: schema.posts.createdAt,
    likes: schema.posts.likeCount,
    reposts: schema.posts.repostCount,
    replies: schema.posts.replyCount,
    quotes: schema.posts.quoteCount,
    bookmarks: schema.posts.bookmarkCount,
    impressions: schema.posts.impressionCount,
  } as const
  const sortCol = sortColumns[sort]
  const dir = order === 'asc' ? asc : desc
  const cmp = order === 'asc' ? gt : lt

  const filters: Array<unknown> = []

  if (q) {
    const like = `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`
    filters.push(or(ilike(schema.posts.text, like), ilike(schema.users.handle, like)))
  }

  if (type === 'original') {
    filters.push(
      and(
        isNull(schema.posts.replyToId),
        isNull(schema.posts.repostOfId),
        isNull(schema.posts.quoteOfId),
      ),
    )
  } else if (type === 'reply') {
    filters.push(isNotNull(schema.posts.replyToId))
  } else if (type === 'repost') {
    filters.push(isNotNull(schema.posts.repostOfId))
  } else if (type === 'quote') {
    filters.push(isNotNull(schema.posts.quoteOfId))
  }

  if (visibility !== 'any') filters.push(eq(schema.posts.visibility, visibility))

  if (status === 'active') filters.push(isNull(schema.posts.deletedAt))
  else if (status === 'deleted') filters.push(isNotNull(schema.posts.deletedAt))
  else if (status === 'sensitive') filters.push(eq(schema.posts.sensitive, true))

  const parsed = parsePostCursor(cursor, sort)
  if (parsed) {
    if (parsed.kind === 'date') {
      filters.push(
        or(
          cmp(schema.posts.createdAt, parsed.date),
          and(eq(schema.posts.createdAt, parsed.date), cmp(schema.posts.id, parsed.id)),
        ),
      )
    } else {
      filters.push(
        or(
          cmp(sortCol, parsed.num),
          and(eq(sortCol, parsed.num), cmp(schema.posts.id, parsed.id)),
        ),
      )
    }
  }

  const rows = await db
    .select({ post: schema.posts, author: schema.users })
    .from(schema.posts)
    .leftJoin(schema.users, eq(schema.users.id, schema.posts.authorId))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .where(filters.length > 0 ? (and(...(filters as Array<any>)) as any) : undefined)
    .orderBy(dir(sortCol), dir(schema.posts.id))
    .limit(limit)

  const postIds = rows.map((r) => r.post.id)
  let reportsByPost = new Map<string, { open: number; total: number }>()
  if (postIds.length > 0) {
    const aggRows = await db
      .select({
        subjectId: schema.reports.subjectId,
        open: sql<number>`count(*) filter (where ${schema.reports.status} = 'open')::int`,
        total: sql<number>`count(*)::int`,
      })
      .from(schema.reports)
      .where(
        and(eq(schema.reports.subjectType, 'post'), inArray(schema.reports.subjectId, postIds)),
      )
      .groupBy(schema.reports.subjectId)
    reportsByPost = new Map(
      aggRows.map((x) => [x.subjectId, { open: x.open, total: x.total }]),
    )
  }

  const items = rows.map((r) => {
    const p = r.post
    const postType: 'original' | 'reply' | 'repost' | 'quote' = p.repostOfId
      ? 'repost'
      : p.quoteOfId
        ? 'quote'
        : p.replyToId
          ? 'reply'
          : 'original'
    const repStats = reportsByPost.get(p.id)
    return {
      id: p.id,
      authorId: p.authorId,
      author: r.author
        ? {
            id: r.author.id,
            handle: r.author.handle,
            displayName: r.author.displayName,
            avatarUrl: assetUrl(mediaEnv, r.author.avatarUrl),
            isVerified: r.author.isVerified,
            role: r.author.role as Role,
          }
        : null,
      text: p.text,
      postType,
      visibility: p.visibility,
      sensitive: p.sensitive,
      likeCount: p.likeCount,
      repostCount: p.repostCount,
      replyCount: p.replyCount,
      quoteCount: p.quoteCount,
      bookmarkCount: p.bookmarkCount,
      impressionCount: p.impressionCount,
      editedAt: p.editedAt?.toISOString() ?? null,
      deletedAt: p.deletedAt?.toISOString() ?? null,
      createdAt: p.createdAt.toISOString(),
      reportsOpen: repStats?.open ?? 0,
      reportsTotal: repStats?.total ?? 0,
    }
  })

  let nextCursor: string | null = null
  if (rows.length === limit) {
    const last = rows[rows.length - 1]!.post
    nextCursor = `${getCursorValue(sort, last)}~${last.id}`
  }

  return c.json({ posts: items, nextCursor })
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
  c.get('ctx').track('admin_post_deleted', session.user.id)
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
  c.get('ctx').track('admin_user_deleted', session.user.id)
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
