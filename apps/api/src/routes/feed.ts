import { Hono } from 'hono'
import { and, desc, eq, inArray, isNull, lt, sql } from '@workspace/db'
import { schema } from '@workspace/db'
import { requireAuth, type HonoEnv } from '../middleware/session.ts'
import { toPostDto } from '../lib/post-dto.ts'
import { loadViewerFlags } from '../lib/viewer-flags.ts'
import { loadPostMedia } from '../lib/post-media.ts'
import { loadArticleCards } from '../lib/article-cards.ts'
import { loadRepostTargets } from '../lib/repost-targets.ts'
import { loadQuoteTargets } from '../lib/quote-targets.ts'
import { attachReplyParents } from '../lib/reply-parents.ts'
import { loadPolls } from '../lib/polls.ts'
import { loadGithubCards } from '../lib/github-cards.ts'
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
  const [flags, mediaMap, articleMap, repostMap, quoteMap, pollMap, githubMap] = await Promise.all([
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
    loadGithubCards(db, ids),
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
      githubMap.get(r.post.id),
    ),
  )
  await attachReplyParents({ db, viewerId: me, env: mediaEnv, posts })
  const nextCursor = posts.length === limit ? posts[posts.length - 1]!.createdAt : null
  const response = { posts, nextCursor }

  if (cacheable) {
    await cache.set(homeFeedCacheKey(me), response, HOME_FEED_TTL_SEC)
    c.header('x-cache', 'miss')
  }
  return c.json(response)
})

// Network feed: posts the viewer's follows recently liked or reposted, where
// the post itself is by someone the viewer does NOT already follow. Useful as
// a "people you don't follow but are adjacent to" timeline. Excludes the
// viewer's blocks/mutes and any post by a blocked author.
const NETWORK_FEED_TTL_SEC = 60

feedRoute.get('/network', requireAuth(), async (c) => {
  const session = c.get('session')!
  const { db, mediaEnv, rateLimit } = c.get('ctx')
  await rateLimit(c, 'reads.feed')
  const limit = Math.min(Number(c.req.query('limit') ?? 40), 100)
  const cursor = parseCursor(c.req.query('cursor'))
  const me = session.user.id

  // The activity that surfaced the post is one of: a like by a follow,
  // a repost row by a follow. We compute MAX(activity_at) per post so the
  // feed is "newest activity first" (X parity for non-following timelines).
  // SECURITY: the WHERE clause excludes posts by anyone in a mutual block
  // relationship and any author the viewer feed-mutes.
  type Row = {
    post: typeof schema.posts.$inferSelect
    author: typeof schema.users.$inferSelect
    activityAt: Date
    actorIds: Array<string>
  }
  // Surface posts via likes from follows.
  const likeRows = await db
    .select({
      post: schema.posts,
      author: schema.users,
      activityAt: schema.likes.createdAt,
      actorId: schema.likes.userId,
    })
    .from(schema.likes)
    .innerJoin(
      schema.follows,
      and(
        eq(schema.follows.followerId, me),
        eq(schema.follows.followeeId, schema.likes.userId),
      ),
    )
    .innerJoin(schema.posts, eq(schema.posts.id, schema.likes.postId))
    .innerJoin(schema.users, eq(schema.users.id, schema.posts.authorId))
    .where(
      and(
        isNull(schema.posts.deletedAt),
        eq(schema.posts.visibility, 'public'),
        // Skip posts by people the viewer already follows; those belong on
        // the home feed. Skip viewer's own posts too.
        sql`NOT EXISTS (SELECT 1 FROM ${schema.follows} ff WHERE ff.follower_id = ${me} AND ff.followee_id = ${schema.posts.authorId})`,
        sql`${schema.posts.authorId} <> ${me}`,
        sql`NOT EXISTS (SELECT 1 FROM ${schema.blocks} b WHERE (b.blocker_id = ${me} AND b.blocked_id = ${schema.posts.authorId}) OR (b.blocker_id = ${schema.posts.authorId} AND b.blocked_id = ${me}))`,
        sql`NOT EXISTS (SELECT 1 FROM ${schema.mutes} m WHERE m.muter_id = ${me} AND m.muted_id = ${schema.posts.authorId} AND (m.scope = 'feed' OR m.scope = 'both'))`,
        cursor ? lt(schema.likes.createdAt, cursor) : undefined,
      ),
    )
    .orderBy(desc(schema.likes.createdAt))
    .limit(limit * 2)

  // Surface posts via reposts from follows. We use the repost row's createdAt
  // (i.e. when the follow reposted it), not the original post's createdAt.
  const repostRows = await db
    .select({
      post: schema.posts,
      author: schema.users,
      activityAt: sql<Date>`reposters.created_at`.as('activity_at'),
      actorId: sql<string>`reposters.author_id`.as('actor_id'),
    })
    .from(
      sql`(
        SELECT r.repost_of_id AS post_id, r.author_id, r.created_at
        FROM ${schema.posts} r
        INNER JOIN ${schema.follows} f
          ON f.follower_id = ${me} AND f.followee_id = r.author_id
        WHERE r.repost_of_id IS NOT NULL
          AND r.deleted_at IS NULL
          ${cursor ? sql`AND r.created_at < ${cursor}` : sql``}
        ORDER BY r.created_at DESC
        LIMIT ${limit * 2}
      ) reposters`,
    )
    .innerJoin(schema.posts, sql`${schema.posts.id} = reposters.post_id`)
    .innerJoin(schema.users, eq(schema.users.id, schema.posts.authorId))
    .where(
      and(
        isNull(schema.posts.deletedAt),
        eq(schema.posts.visibility, 'public'),
        sql`NOT EXISTS (SELECT 1 FROM ${schema.follows} ff WHERE ff.follower_id = ${me} AND ff.followee_id = ${schema.posts.authorId})`,
        sql`${schema.posts.authorId} <> ${me}`,
        sql`NOT EXISTS (SELECT 1 FROM ${schema.blocks} b WHERE (b.blocker_id = ${me} AND b.blocked_id = ${schema.posts.authorId}) OR (b.blocker_id = ${schema.posts.authorId} AND b.blocked_id = ${me}))`,
        sql`NOT EXISTS (SELECT 1 FROM ${schema.mutes} m WHERE m.muter_id = ${me} AND m.muted_id = ${schema.posts.authorId} AND (m.scope = 'feed' OR m.scope = 'both'))`,
      ),
    )

  // Merge by post id, keeping the most recent activity for ordering and
  // accumulating the set of follows that interacted with each post. Cap to
  // the requested limit after merging.
  const byId = new Map<string, Row>()
  for (const row of likeRows) {
    const existing = byId.get(row.post.id)
    if (!existing) {
      byId.set(row.post.id, {
        post: row.post,
        author: row.author,
        activityAt: row.activityAt,
        actorIds: [row.actorId],
      })
    } else {
      if (row.activityAt > existing.activityAt) existing.activityAt = row.activityAt
      if (!existing.actorIds.includes(row.actorId)) existing.actorIds.push(row.actorId)
    }
  }
  for (const row of repostRows) {
    const existing = byId.get(row.post.id)
    const at = row.activityAt instanceof Date ? row.activityAt : new Date(row.activityAt)
    if (!existing) {
      byId.set(row.post.id, {
        post: row.post,
        author: row.author,
        activityAt: at,
        actorIds: [row.actorId],
      })
    } else {
      if (at > existing.activityAt) existing.activityAt = at
      if (!existing.actorIds.includes(row.actorId)) existing.actorIds.push(row.actorId)
    }
  }

  const merged = [...byId.values()]
    .sort((a, b) => b.activityAt.getTime() - a.activityAt.getTime())
    .slice(0, limit)

  const ids = merged.map((r) => r.post.id)
  const [flags, mediaMap, articleMap, repostMapPost, quoteMapPost, pollMap, githubMap] = await Promise.all([
    loadViewerFlags(db, me, ids),
    loadPostMedia(db, ids),
    loadArticleCards(db, ids),
    loadRepostTargets({
      db,
      viewerId: me,
      env: mediaEnv,
      repostRows: merged.map((r) => ({ id: r.post.id, repostOfId: r.post.repostOfId })),
    }),
    loadQuoteTargets({
      db,
      viewerId: me,
      env: mediaEnv,
      quoteRows: merged.map((r) => ({ id: r.post.id, quoteOfId: r.post.quoteOfId })),
    }),
    loadPolls(db, me, ids),
    loadGithubCards(db, ids),
  ])
  // Pull the triggering actors' handles for the "Lucas + 2 others liked this"
  // banner. We cap at 3 ids per post; the count beyond that is shown as
  // "+N others" in the UI.
  const allActorIds = new Set<string>()
  for (const r of merged) for (const id of r.actorIds.slice(0, 3)) allActorIds.add(id)
  const actorMap = new Map<
    string,
    { id: string; handle: string | null; displayName: string | null }
  >()
  if (allActorIds.size > 0) {
    // Drizzle's tagged sql expands a JS array into N separate parameters
    // (e.g. `ANY(($1, $2, $3))`) — that's a row constructor, not an array,
    // and Postgres rejects it with "operator does not exist: uuid = record".
    // Use the canonical inArray() helper which always emits the correct
    // `= ANY($1::uuid[])` binding.
    const actorRows = await db
      .select({
        id: schema.users.id,
        handle: schema.users.handle,
        displayName: schema.users.displayName,
      })
      .from(schema.users)
      .where(inArray(schema.users.id, [...allActorIds]))
    for (const u of actorRows) actorMap.set(u.id, u)
  }

  const posts = merged.map((r) => ({
    ...toPostDto(
      r.post,
      r.author,
      flags.get(r.post.id),
      mediaMap.get(r.post.id),
      mediaEnv,
      articleMap.get(r.post.id),
      repostMapPost.get(r.post.id),
      quoteMapPost.get(r.post.id),
      pollMap.get(r.post.id),
      githubMap.get(r.post.id),
    ),
    networkActors: r.actorIds
      .slice(0, 3)
      .map((id) => actorMap.get(id))
      .filter((u): u is NonNullable<typeof u> => Boolean(u)),
    networkActorTotal: r.actorIds.length,
    networkActivityAt: r.activityAt.toISOString(),
  }))
  await attachReplyParents({ db, viewerId: me, env: mediaEnv, posts })
  const nextCursor =
    posts.length === limit ? merged[merged.length - 1]!.activityAt.toISOString() : null
  // Suppress unused TTL constant warning (kept for future caching hooks).
  void NETWORK_FEED_TTL_SEC
  return c.json({ posts, nextCursor })
})
