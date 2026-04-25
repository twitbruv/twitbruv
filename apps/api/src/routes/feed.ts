import { Hono } from 'hono'
import { and, desc, eq, isNull, lt, sql } from '@workspace/db'
import { schema } from '@workspace/db'
import { requireAuth, type HonoEnv } from '../middleware/session.ts'
import { toPostDto } from '../lib/post-dto.ts'
import { loadViewerFlags } from '../lib/viewer-flags.ts'
import { loadPostMedia } from '../lib/post-media.ts'
import { loadArticleCards } from '../lib/article-cards.ts'
import { loadRepostTargets } from '../lib/repost-targets.ts'
import { loadQuoteTargets } from '../lib/quote-targets.ts'
import { loadPolls } from '../lib/polls.ts'
import { parseCursor } from '../lib/cursor.ts'

export const feedRoute = new Hono<HonoEnv>()

const HOME_FEED_TTL_SEC = 30

export function homeFeedCacheKey(userId: string) {
  return `feed:home:${userId}:v1`
}

/**
 * Profile feed cache key. Keyed by author id (the canonical id, not handle, so a handle
 * change doesn't strand a stale entry). The viewer is intentionally not part of the key —
 * the post list itself is identical for all viewers; per-viewer flags (liked/bookmarked)
 * are layered on after the cache lookup.
 */
export function profileFeedCacheKey(authorId: string) {
  return `feed:profile:${authorId}:v1`
}

// Home feed: reverse-chrono from follows, excluding blocks and muted-feed users.
feedRoute.get('/', requireAuth(), async (c) => {
  const session = c.get('session')!
  const { db, mediaEnv, cache, rateLimit } = c.get('ctx')
  await rateLimit(c, 'reads.feed')
  const limit = Math.min(Number(c.req.query('limit') ?? 40), 100)
  const cursor = parseCursor(c.req.query('cursor'))
  const me = session.user.id

  // Cache only page 0 (no cursor) with default limit. Deeper pages are rarely fetched and
  // caching every (cursor, limit) combo isn't worth the keyspace.
  const cacheable = !cursor && limit === 40
  if (cacheable) {
    const hit = await cache.get<{ posts: unknown; nextCursor: string | null }>(homeFeedCacheKey(me))
    if (hit) {
      c.header('x-cache', 'hit')
      return c.json(hit)
    }
  }

  const rows = await db
    .select({ post: schema.posts, author: schema.users })
    .from(schema.posts)
    .innerJoin(schema.users, eq(schema.users.id, schema.posts.authorId))
    .innerJoin(schema.follows, eq(schema.follows.followeeId, schema.posts.authorId))
    .where(
      and(
        eq(schema.follows.followerId, me),
        isNull(schema.posts.deletedAt),
        cursor ? lt(schema.posts.createdAt, cursor) : undefined,
        sql`NOT EXISTS (SELECT 1 FROM ${schema.blocks} b WHERE (b.blocker_id = ${me} AND b.blocked_id = ${schema.posts.authorId}) OR (b.blocker_id = ${schema.posts.authorId} AND b.blocked_id = ${me}))`,
        sql`NOT EXISTS (SELECT 1 FROM ${schema.mutes} m WHERE m.muter_id = ${me} AND m.muted_id = ${schema.posts.authorId} AND (m.scope = 'feed' OR m.scope = 'both'))`,
      ),
    )
    .orderBy(desc(schema.posts.createdAt))
    .limit(limit)

  const ids = rows.map((r) => r.post.id)
  const [flags, mediaMap, articleMap, repostMap, quoteMap, pollMap] = await Promise.all([
    loadViewerFlags(db, me, ids),
    loadPostMedia(db, ids),
    loadArticleCards(db, ids),
    loadRepostTargets({
      db,
      viewerId: me,
      env: mediaEnv,
      repostRows: rows.map((r) => ({ id: r.post.id, repostOfId: r.post.repostOfId })),
    }),
    loadQuoteTargets({
      db,
      viewerId: me,
      env: mediaEnv,
      quoteRows: rows.map((r) => ({ id: r.post.id, quoteOfId: r.post.quoteOfId })),
    }),
    loadPolls(db, me, ids),
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
  const response = { posts, nextCursor }

  if (cacheable) {
    await cache.set(homeFeedCacheKey(me), response, HOME_FEED_TTL_SEC)
    c.header('x-cache', 'miss')
  }
  return c.json(response)
})
