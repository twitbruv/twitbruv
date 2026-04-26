import { Hono } from 'hono'
import { z } from 'zod'
import { and, desc, eq, gte, inArray, isNotNull, isNull, sql } from '@workspace/db'
import { schema } from '@workspace/db'
import { requireHandle, type HonoEnv } from '../middleware/session.ts'
import { toPostDto } from '../lib/post-dto.ts'
import { loadViewerFlags } from '../lib/viewer-flags.ts'
import { loadPostMedia } from '../lib/post-media.ts'
import { loadArticleCards } from '../lib/article-cards.ts'
import { loadQuoteTargets } from '../lib/quote-targets.ts'
import { loadRepostTargets } from '../lib/repost-targets.ts'

export const analyticsRoute = new Hono<HonoEnv>()

const ingestSchema = z.object({
  events: z
    .array(
      z.object({
        kind: z.enum(['impression']),
        subjectType: z.enum(['post', 'article', 'profile']),
        subjectId: z.string().uuid(),
      }),
    )
    .min(1)
    .max(50),
})

// Public ingest endpoint. Logged-out viewers still count toward impression totals.
analyticsRoute.post('/ingest', async (c) => {
  const session = c.get('session')
  const { db, rateLimit } = c.get('ctx')
  await rateLimit(c, 'analytics.ingest')
  const body = ingestSchema.parse(await c.req.json())

  // Best-effort ownerUserId resolution so dashboard queries can partition-prune.
  const postIds = Array.from(
    new Set(body.events.filter((e) => e.subjectType === 'post').map((e) => e.subjectId)),
  )
  const ownerByPost = new Map<string, string>()
  if (postIds.length > 0) {
    const rows = await db
      .select({ id: schema.posts.id, authorId: schema.posts.authorId })
      .from(schema.posts)
      .where(inArray(schema.posts.id, postIds))
    for (const r of rows) ownerByPost.set(r.id, r.authorId)
  }

  const now = new Date()
  const rows = body.events.map((e) => ({
    kind: e.kind,
    subjectType: e.subjectType,
    subjectId: e.subjectId,
    actorUserId: session?.user.id ?? null,
    ownerUserId: e.subjectType === 'post' ? ownerByPost.get(e.subjectId) ?? null : null,
    createdAt: now,
  }))
  await db.insert(schema.analyticsEvents).values(rows)
  return c.json({ accepted: rows.length })
})

// 28-day creator overview.
analyticsRoute.get('/overview', requireHandle(), async (c) => {
  const session = c.get('session')!
  const { db } = c.get('ctx')
  const periodDays = Math.min(Math.max(Number(c.req.query('days') ?? 28), 1), 90)
  const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000)
  const me = session.user.id

  // Counts on my own posts over the window. Each aggregation runs against its own indexed
  // table; joins stay cheap because we scope by author first.
  const [
    likes,
    reposts,
    replies,
    bookmarks,
    quotes,
    impressions,
    followerDelta,
    followsByDay,
    followerTotal,
    followingTotal,
    originalPostsInPeriod,
    repostsAuthoredInPeriod,
    articlesPublishedInPeriod,
    impressionsByDay,
  ] = await Promise.all([
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.likes)
        .innerJoin(schema.posts, eq(schema.posts.id, schema.likes.postId))
        .where(and(eq(schema.posts.authorId, me), gte(schema.likes.createdAt, since))),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.posts)
        .where(
          and(
            gte(schema.posts.createdAt, since),
            sql`${schema.posts.repostOfId} IN (SELECT id FROM ${schema.posts} WHERE author_id = ${me})`,
            isNull(schema.posts.deletedAt),
          ),
        ),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.posts)
        .where(
          and(
            gte(schema.posts.createdAt, since),
            sql`${schema.posts.replyToId} IN (SELECT id FROM ${schema.posts} WHERE author_id = ${me})`,
            isNull(schema.posts.deletedAt),
          ),
        ),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.bookmarks)
        .innerJoin(schema.posts, eq(schema.posts.id, schema.bookmarks.postId))
        .where(and(eq(schema.posts.authorId, me), gte(schema.bookmarks.createdAt, since))),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.posts)
        .where(
          and(
            gte(schema.posts.createdAt, since),
            sql`${schema.posts.quoteOfId} IN (SELECT id FROM ${schema.posts} WHERE author_id = ${me})`,
            isNull(schema.posts.deletedAt),
          ),
        ),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.analyticsEvents)
        .where(
          and(
            eq(schema.analyticsEvents.ownerUserId, me),
            eq(schema.analyticsEvents.kind, 'impression'),
            gte(schema.analyticsEvents.createdAt, since),
          ),
        ),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.follows)
        .where(and(eq(schema.follows.followeeId, me), gte(schema.follows.createdAt, since))),
      // Follower growth per day (new-follows only; unfollows aren't tracked as events yet).
      db
        .select({
          day: sql<string>`to_char(date_trunc('day', ${schema.follows.createdAt}), 'YYYY-MM-DD')`,
          n: sql<number>`count(*)::int`,
        })
        .from(schema.follows)
        .where(and(eq(schema.follows.followeeId, me), gte(schema.follows.createdAt, since)))
        .groupBy(sql`date_trunc('day', ${schema.follows.createdAt})`)
        .orderBy(sql`date_trunc('day', ${schema.follows.createdAt})`),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.follows)
        .where(eq(schema.follows.followeeId, me)),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.follows)
        .where(eq(schema.follows.followerId, me)),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.posts)
        .where(
          and(
            eq(schema.posts.authorId, me),
            gte(schema.posts.createdAt, since),
            isNull(schema.posts.deletedAt),
            isNull(schema.posts.repostOfId),
          ),
        ),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.posts)
        .where(
          and(
            eq(schema.posts.authorId, me),
            gte(schema.posts.createdAt, since),
            isNull(schema.posts.deletedAt),
            isNotNull(schema.posts.repostOfId),
          ),
        ),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.articles)
        .where(
          and(
            eq(schema.articles.authorId, me),
            eq(schema.articles.status, 'published'),
            isNull(schema.articles.deletedAt),
            isNotNull(schema.articles.publishedAt),
            gte(schema.articles.publishedAt, since),
          ),
        ),
      db
        .select({
          day: sql<string>`to_char(date_trunc('day', ${schema.analyticsEvents.createdAt}), 'YYYY-MM-DD')`,
          n: sql<number>`count(*)::int`,
        })
        .from(schema.analyticsEvents)
        .where(
          and(
            eq(schema.analyticsEvents.ownerUserId, me),
            eq(schema.analyticsEvents.kind, 'impression'),
            gte(schema.analyticsEvents.createdAt, since),
          ),
        )
        .groupBy(sql`date_trunc('day', ${schema.analyticsEvents.createdAt})`)
        .orderBy(sql`date_trunc('day', ${schema.analyticsEvents.createdAt})`),
    ])

  const engagements =
    (likes[0]?.n ?? 0) +
    (reposts[0]?.n ?? 0) +
    (replies[0]?.n ?? 0) +
    (bookmarks[0]?.n ?? 0) +
    (quotes[0]?.n ?? 0)
  const impressionTotal = impressions[0]?.n ?? 0
  const engagementRate = impressionTotal > 0 ? engagements / impressionTotal : 0

  // Top 5 posts in the window, ranked by engagement counts. We compute a lightweight composite
  // score from the existing denorm counters — no need to re-aggregate per-post for the top-K.
  const topPostsRows = await db
    .select({ post: schema.posts, author: schema.users })
    .from(schema.posts)
    .innerJoin(schema.users, eq(schema.users.id, schema.posts.authorId))
    .where(
      and(
        eq(schema.posts.authorId, me),
        gte(schema.posts.createdAt, since),
        isNull(schema.posts.deletedAt),
      ),
    )
    .orderBy(
      desc(
        sql`${schema.posts.likeCount} + ${schema.posts.repostCount} + ${schema.posts.replyCount} + ${schema.posts.bookmarkCount} + ${schema.posts.quoteCount}`,
      ),
    )
    .limit(5)

  const ids = topPostsRows.map((r) => r.post.id)
  const env = c.get('ctx').mediaEnv
  const [flags, mediaMap, articleMap, repostMap, quoteMap] = await Promise.all([
    loadViewerFlags(db, me, ids),
    loadPostMedia(db, ids),
    loadArticleCards(db, ids),
    loadRepostTargets({
      db,
      viewerId: me,
      env,
      repostRows: topPostsRows.map((r) => ({ id: r.post.id, repostOfId: r.post.repostOfId })),
    }),
    loadQuoteTargets({
      db,
      viewerId: me,
      env,
      quoteRows: topPostsRows.map((r) => ({ id: r.post.id, quoteOfId: r.post.quoteOfId })),
    }),
  ])
  const topPosts = topPostsRows.map((r) =>
    toPostDto(
      r.post,
      r.author,
      flags.get(r.post.id),
      mediaMap.get(r.post.id),
      env,
      articleMap.get(r.post.id),
      repostMap.get(r.post.id),
      quoteMap.get(r.post.id),
    ),
  )

  return c.json({
    period: { days: periodDays, since: since.toISOString() },
    totals: {
      impressions: impressionTotal,
      engagements,
      likes: likes[0]?.n ?? 0,
      reposts: reposts[0]?.n ?? 0,
      replies: replies[0]?.n ?? 0,
      bookmarks: bookmarks[0]?.n ?? 0,
      quotes: quotes[0]?.n ?? 0,
      newFollowers: followerDelta[0]?.n ?? 0,
      engagementRate,
    },
    snapshot: {
      followerCount: followerTotal[0]?.n ?? 0,
      followingCount: followingTotal[0]?.n ?? 0,
      originalPosts: originalPostsInPeriod[0]?.n ?? 0,
      repostsAuthored: repostsAuthoredInPeriod[0]?.n ?? 0,
      articlesPublished: articlesPublishedInPeriod[0]?.n ?? 0,
    },
    followerGrowth: followsByDay.map((r) => ({ day: r.day, newFollowers: r.n })),
    impressionsByDay: impressionsByDay.map((r) => ({ day: r.day, count: r.n })),
    topPosts,
  })
})
