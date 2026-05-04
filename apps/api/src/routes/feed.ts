import { Hono } from "hono"
import {
  and,
  desc,
  eq,
  inArray,
  isNull,
  lt,
  sql,
  schema,
  type Database,
} from "@workspace/db"
import {
  FOR_YOU_ALGO_VERSION,
  bucketForYouVariant,
  type ForYouRankRequest,
} from "@workspace/types"
import {
  FEED_DEFAULT_LIMIT,
  feedQuerySchema,
  forYouFeedQuerySchema,
} from "@workspace/validators"
import { requireHandle, type HonoEnv } from "../middleware/session.ts"
import { toPostDto, type PostDto } from "../lib/post-dto.ts"
import { loadViewerFlags } from "../lib/viewer-flags.ts"
import { loadPostMedia } from "../lib/post-media.ts"
import { loadArticleCards } from "../lib/article-cards.ts"
import { loadRepostTargets } from "../lib/repost-targets.ts"
import { loadQuoteTargets } from "../lib/quote-targets.ts"
import {
  attachFeedChainPreviews,
  linkSamePageReplies,
  filterRedundantChainPosts,
  linkAndDeduplicateRanked,
} from "../lib/feed-chain-preview.ts"
import { attachReplyParents } from "../lib/reply-parents.ts"
import { loadPolls } from "../lib/polls.ts"
import { loadUnfurlCards } from "../lib/unfurl-cards.ts"
import { parseCursor } from "../lib/cursor.ts"
import { callForYouRanker } from "../lib/feed-ranker.ts"
import { hydratePostsByIds } from "../lib/feed-hydrate.ts"

export const feedRoute = new Hono<HonoEnv>()

const HOME_FEED_TTL_SEC = 30
const FALLBACK_FEED_TOP_UP = 20

export function homeFeedCacheKey(userId: string) {
  return `feed:home:${userId}:v3`
}

/**
 * Profile feed cache key. Keyed by author id (the canonical id, not handle, so a handle
 * change doesn't strand a stale entry). The viewer is intentionally not part of the key —
 * the post list itself is identical for all viewers; per-viewer flags (liked/bookmarked)
 * are layered on after the cache lookup.
 */
export function profileFeedCacheKey(authorId: string) {
  return `feed:profile:${authorId}:v2`
}

// Home feed: reverse-chrono from follows, excluding blocks and muted-feed users.
feedRoute.get("/", requireHandle(), async (c) => {
  const session = c.get("session")!
  const { db, mediaEnv, cache, rateLimit } = c.get("ctx")
  await rateLimit(c, "reads.feed")
  const query = feedQuerySchema.parse(c.req.query())
  const limit = query.limit
  const cursor = parseCursor(query.cursor)
  const me = session.user.id

  // Cache only page 0 (no cursor) with default limit. Deeper pages are rarely fetched and
  // caching every (cursor, limit) combo isn't worth the keyspace.
  const cacheable = !cursor && limit === FEED_DEFAULT_LIMIT
  if (cacheable) {
    const hit = await cache.get<{ posts: unknown; nextCursor: string | null }>(
      homeFeedCacheKey(me)
    )
    if (hit) {
      c.header("x-cache", "hit")
      return c.json(hit)
    }
  }

  const rows = await db
    .select({ post: schema.posts, author: schema.users })
    .from(schema.posts)
    .innerJoin(schema.users, eq(schema.users.id, schema.posts.authorId))
    .innerJoin(
      schema.follows,
      eq(schema.follows.followeeId, schema.posts.authorId)
    )
    .where(
      and(
        eq(schema.follows.followerId, me),
        isNull(schema.posts.deletedAt),
        cursor ? lt(schema.posts.createdAt, cursor) : undefined,
        sql`NOT EXISTS (SELECT 1 FROM ${schema.blocks} b WHERE (b.blocker_id = ${me} AND b.blocked_id = ${schema.posts.authorId}) OR (b.blocker_id = ${schema.posts.authorId} AND b.blocked_id = ${me}))`,
        sql`NOT EXISTS (SELECT 1 FROM ${schema.mutes} m WHERE m.muter_id = ${me} AND m.muted_id = ${schema.posts.authorId} AND (m.scope = 'feed' OR m.scope = 'both'))`
      )
    )
    .orderBy(desc(schema.posts.createdAt))
    .limit(limit)

  const ids = rows.map((r) => r.post.id)
  const [flags, mediaMap, articleMap, repostMap, quoteMap, pollMap] =
    await Promise.all([
      loadViewerFlags(db, me, ids),
      loadPostMedia(db, ids),
      loadArticleCards(db, ids),
      loadRepostTargets({
        db,
        viewerId: me,
        env: mediaEnv,
        repostRows: rows.map((r) => ({
          id: r.post.id,
          repostOfId: r.post.repostOfId,
        })),
      }),
      loadQuoteTargets({
        db,
        viewerId: me,
        env: mediaEnv,
        quoteRows: rows.map((r) => ({
          id: r.post.id,
          quoteOfId: r.post.quoteOfId,
        })),
      }),
      loadPolls(db, me, ids),
    ])
  const unfurlCardsMap = await loadUnfurlCards(db, ids, articleMap)
  const posts = rows.map((r) =>
    toPostDto(
      r.post,
      r.author,
      flags.get(r.post.id),
      mediaMap.get(r.post.id),
      mediaEnv,
      unfurlCardsMap.get(r.post.id),
      repostMap.get(r.post.id),
      quoteMap.get(r.post.id),
      pollMap.get(r.post.id)
    )
  )
  await attachReplyParents({ db, viewerId: me, env: mediaEnv, posts })
  await attachFeedChainPreviews({ db, viewerId: me, env: mediaEnv, posts })
  linkSamePageReplies(posts)
  const filtered = filterRedundantChainPosts(posts)
  const hasMore = rows.length === limit
  const nextCursor = hasMore
    ? rows[rows.length - 1]!.post.createdAt.toISOString()
    : null
  const response = { posts: filtered, nextCursor }

  if (cacheable) {
    await cache.set(homeFeedCacheKey(me), response, HOME_FEED_TTL_SEC)
    c.header("x-cache", "miss")
  }
  return c.json(response)
})

// Network feed: posts the viewer's follows recently liked or reposted, where
// the post itself is by someone the viewer does NOT already follow. Useful as
// a "people you don't follow but are adjacent to" timeline. Excludes the
// viewer's blocks/mutes and any post by a blocked author.
const NETWORK_FEED_TTL_SEC = 60

feedRoute.get("/network", requireHandle(), async (c) => {
  const session = c.get("session")!
  const { db, mediaEnv, rateLimit } = c.get("ctx")
  await rateLimit(c, "reads.feed")
  const query = feedQuerySchema.parse(c.req.query())
  const limit = query.limit
  const cursor = parseCursor(query.cursor)
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
  const sourceWindow = limit * 2
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
        eq(schema.follows.followeeId, schema.likes.userId)
      )
    )
    .innerJoin(schema.posts, eq(schema.posts.id, schema.likes.postId))
    .innerJoin(schema.users, eq(schema.users.id, schema.posts.authorId))
    .where(
      and(
        isNull(schema.posts.deletedAt),
        eq(schema.posts.visibility, "public"),
        // Skip posts by people the viewer already follows; those belong on
        // the home feed. Skip viewer's own posts too.
        sql`NOT EXISTS (SELECT 1 FROM ${schema.follows} ff WHERE ff.follower_id = ${me} AND ff.followee_id = ${schema.posts.authorId})`,
        sql`${schema.posts.authorId} <> ${me}`,
        sql`NOT EXISTS (SELECT 1 FROM ${schema.blocks} b WHERE (b.blocker_id = ${me} AND b.blocked_id = ${schema.posts.authorId}) OR (b.blocker_id = ${schema.posts.authorId} AND b.blocked_id = ${me}))`,
        sql`NOT EXISTS (SELECT 1 FROM ${schema.mutes} m WHERE m.muter_id = ${me} AND m.muted_id = ${schema.posts.authorId} AND (m.scope = 'feed' OR m.scope = 'both'))`,
        cursor ? lt(schema.likes.createdAt, cursor) : undefined
      )
    )
    .orderBy(desc(schema.likes.createdAt))
    .limit(sourceWindow)

  // Surface posts via reposts from follows. We use the repost row's createdAt
  // (i.e. when the follow reposted it), not the original post's createdAt.
  const repostRows = await db
    .select({
      post: schema.posts,
      author: schema.users,
      activityAt: sql<Date>`reposters.created_at`.as("activity_at"),
      actorId: sql<string>`reposters.author_id`.as("actor_id"),
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
        LIMIT ${sourceWindow}
      ) reposters`
    )
    .innerJoin(schema.posts, sql`${schema.posts.id} = reposters.post_id`)
    .innerJoin(schema.users, eq(schema.users.id, schema.posts.authorId))
    .where(
      and(
        isNull(schema.posts.deletedAt),
        eq(schema.posts.visibility, "public"),
        sql`NOT EXISTS (SELECT 1 FROM ${schema.follows} ff WHERE ff.follower_id = ${me} AND ff.followee_id = ${schema.posts.authorId})`,
        sql`${schema.posts.authorId} <> ${me}`,
        sql`NOT EXISTS (SELECT 1 FROM ${schema.blocks} b WHERE (b.blocker_id = ${me} AND b.blocked_id = ${schema.posts.authorId}) OR (b.blocker_id = ${schema.posts.authorId} AND b.blocked_id = ${me}))`,
        sql`NOT EXISTS (SELECT 1 FROM ${schema.mutes} m WHERE m.muter_id = ${me} AND m.muted_id = ${schema.posts.authorId} AND (m.scope = 'feed' OR m.scope = 'both'))`
      )
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
      if (row.activityAt > existing.activityAt)
        existing.activityAt = row.activityAt
      if (!existing.actorIds.includes(row.actorId))
        existing.actorIds.push(row.actorId)
    }
  }
  for (const row of repostRows) {
    const existing = byId.get(row.post.id)
    const at =
      row.activityAt instanceof Date ? row.activityAt : new Date(row.activityAt)
    if (!existing) {
      byId.set(row.post.id, {
        post: row.post,
        author: row.author,
        activityAt: at,
        actorIds: [row.actorId],
      })
    } else {
      if (at > existing.activityAt) existing.activityAt = at
      if (!existing.actorIds.includes(row.actorId))
        existing.actorIds.push(row.actorId)
    }
  }

  const merged = [...byId.values()]
    .sort((a, b) => b.activityAt.getTime() - a.activityAt.getTime())
    .slice(0, limit)

  const ids = merged.map((r) => r.post.id)
  const [flags, mediaMap, articleMap, repostMapPost, quoteMapPost, pollMap] =
    await Promise.all([
      loadViewerFlags(db, me, ids),
      loadPostMedia(db, ids),
      loadArticleCards(db, ids),
      loadRepostTargets({
        db,
        viewerId: me,
        env: mediaEnv,
        repostRows: merged.map((r) => ({
          id: r.post.id,
          repostOfId: r.post.repostOfId,
        })),
      }),
      loadQuoteTargets({
        db,
        viewerId: me,
        env: mediaEnv,
        quoteRows: merged.map((r) => ({
          id: r.post.id,
          quoteOfId: r.post.quoteOfId,
        })),
      }),
      loadPolls(db, me, ids),
    ])
  const unfurlCardsMapNetwork = await loadUnfurlCards(db, ids, articleMap)
  // Pull the triggering actors' handles for the "Lucas + 2 others liked this"
  // banner. We cap at 3 ids per post; the count beyond that is shown as
  // "+N others" in the UI.
  const allActorIds = new Set<string>()
  for (const r of merged)
    for (const id of r.actorIds.slice(0, 3)) allActorIds.add(id)
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
      unfurlCardsMapNetwork.get(r.post.id),
      repostMapPost.get(r.post.id),
      quoteMapPost.get(r.post.id),
      pollMap.get(r.post.id)
    ),
    networkActors: r.actorIds
      .slice(0, 3)
      .map((id) => actorMap.get(id))
      .filter((u): u is NonNullable<typeof u> => Boolean(u)),
    networkActorTotal: r.actorIds.length,
    networkActivityAt: r.activityAt.toISOString(),
  }))
  await attachReplyParents({ db, viewerId: me, env: mediaEnv, posts })
  const hasMore =
    likeRows.length === sourceWindow || repostRows.length === sourceWindow
  const rawActivityTimes = [
    ...likeRows.map((row) => row.activityAt),
    ...repostRows.map((row) =>
      row.activityAt instanceof Date ? row.activityAt : new Date(row.activityAt)
    ),
  ]
    .map((at) => at.getTime())
    .filter(Number.isFinite)
  const nextCursor =
    hasMore && rawActivityTimes.length > 0
      ? new Date(Math.min(...rawActivityTimes)).toISOString()
      : null
  // Suppress unused TTL constant warning (kept for future caching hooks).
  void NETWORK_FEED_TTL_SEC
  return c.json({ posts, nextCursor })
})

// =============================================================================
// For You feed
// =============================================================================
//
// Thin orchestration layer over the internal feed-ranker service. The API:
//
//   1. computes `variant` and `algoVersion` itself (so the cache key is correct
//      *before* any ranker call), then
//   2. checks a short-TTL page-0 cache, then
//   3. asks the ranker for ordered post IDs with a strict timeout, then
//   4. hydrates and re-applies safety filters in this process, then
//   5. returns the page along with `algoVersion` + `variant` so analytics events
//      can attribute outcomes back to the ranking formula they came from.
//
// On page 1 a ranker timeout / outage falls back to a blended chrono feed (network ->
// following -> public top-up). On page 2+ a missing ranking session is surfaced to the
// client as `restartRequired: true`, never silently swapped to a chrono feed — the plan
// is explicit that mid-scroll feed swaps are worse than a clean restart.
const FOR_YOU_PAGE_TTL_SEC = 30
const FOR_YOU_RANKER_MAX_LIMIT = 200

export function forYouFeedCacheKey(args: {
  userId: string
  variant: string
  algoVersion: string
}) {
  return `feed:foryou:${args.userId}:${args.variant}:${args.algoVersion}:v1`
}

feedRoute.get("/for-you", requireHandle(), async (c) => {
  const session = c.get("session")!
  const { db, mediaEnv, cache, env, log, rateLimit } = c.get("ctx")
  await rateLimit(c, "reads.feed")

  const me = session.user.id
  const { limit, cursor } = forYouFeedQuerySchema.parse(c.req.query())
  // The ranker owns opaque cursor validation. Preserve any provided value so malformed or
  // expired cursors produce the same explicit restartRequired path instead of silently
  // downgrading the request to a first page.

  // Compute experiment assignment + algo version on the API side so the cache key, response
  // metadata, and analytics attribution all match even if the ranker is unreachable.
  const algoVersion = FOR_YOU_ALGO_VERSION
  const variant = bucketForYouVariant(me)

  const cacheable = !cursor && limit === FEED_DEFAULT_LIMIT
  const cacheKey = forYouFeedCacheKey({ userId: me, variant, algoVersion })

  if (cacheable) {
    const hit = await cache.get<ForYouFeedResponse>(cacheKey)
    if (hit) {
      c.header("x-cache", "hit")
      return c.json(hit)
    }
  }

  const rankerLimit = Math.min(limit, FOR_YOU_RANKER_MAX_LIMIT)
  const rankRequest: ForYouRankRequest = {
    userId: me,
    limit: rankerLimit,
    cursor,
    algoVersion,
    variant,
  }

  const ranker = await callForYouRanker({
    config: {
      url: env.FEED_RANKER_URL,
      token: env.FEED_RANKER_TOKEN,
      timeoutMs: env.FEED_RANKER_TIMEOUT_MS,
    },
    request: rankRequest,
    log,
  })

  if (ranker.kind === "session_expired") {
    // Page 2+ with a stale session. The client should refresh from page 1.
    return c.json(
      {
        error: "session_expired",
        restartRequired: true,
        algoVersion,
        variant,
      },
      410
    )
  }

  if (ranker.kind === "unavailable") {
    if (cursor) {
      // We can't honour a ranker cursor without the ranker. Treat this the same as an
      // expired session: tell the client to restart, don't quietly swap feed mode.
      log.warn({ reason: ranker.reason }, "feed_for_you_cursor_without_ranker")
      return c.json(
        {
          error: "session_expired",
          restartRequired: true,
          algoVersion,
          variant,
        },
        410
      )
    }

    const fallbackIds = await buildForYouFallbackIds({
      db,
      viewerId: me,
      limit: limit + FALLBACK_FEED_TOP_UP,
    })
    const fallbackPosts = await hydratePostsByIds({
      db,
      viewerId: me,
      mediaEnv,
      postIds: fallbackIds,
    })
    await attachFeedChainPreviews({
      db,
      viewerId: me,
      env: mediaEnv,
      posts: fallbackPosts,
    })
    const linkedFallback = linkAndDeduplicateRanked(fallbackPosts)
    const trimmed = linkedFallback.slice(0, limit)
    const fallbackResponse: ForYouFeedResponse = {
      posts: trimmed,
      nextCursor: null,
      algoVersion,
      variant,
      fallback: true,
    }
    // Don't cache fallback under the page-0 key — we want to retry the ranker on the next
    // request, not lock in a chrono response for 30s.
    c.header("x-cache", "fallback")
    c.header("x-feed-fallback-reason", ranker.reason)
    return c.json(fallbackResponse)
  }

  const ordered = await hydratePostsByIds({
    db,
    viewerId: me,
    mediaEnv,
    postIds: ranker.data.postIds,
  })
  await attachFeedChainPreviews({
    db,
    viewerId: me,
    env: mediaEnv,
    posts: ordered,
  })
  const linked = linkAndDeduplicateRanked(ordered)
  const trimmed = linked.slice(0, limit)
  if (
    ranker.data.algoVersion !== algoVersion ||
    ranker.data.variant !== variant
  ) {
    log.warn(
      {
        apiAlgoVersion: algoVersion,
        rankerAlgoVersion: ranker.data.algoVersion,
        apiVariant: variant,
        rankerVariant: ranker.data.variant,
      },
      "feed_for_you_ranker_metadata_mismatch"
    )
  }

  const response: ForYouFeedResponse = {
    posts: trimmed,
    // The ranker's nextCursor refers to its session, not to anything API-side. Pass it
    // through unchanged. If hydration dropped enough posts that we're returning fewer than
    // `limit`, we still pass the cursor through — the client will try to fetch more and
    // the ranker will continue from its offset.
    nextCursor: ranker.data.nextCursor,
    algoVersion,
    variant,
  }

  if (cacheable) {
    await cache.set(cacheKey, response, FOR_YOU_PAGE_TTL_SEC)
    c.header("x-cache", "miss")
  }
  return c.json(response)
})

interface ForYouFeedResponse {
  posts: PostDto[]
  nextCursor: string | null
  algoVersion: string
  variant: string
  fallback?: boolean
}

// =============================================================================
// Page-1 fallback: blended chrono feed
// =============================================================================
//
// Used only when the ranker is unreachable / times out / errors and the client is asking
// for the first page (no cursor). Mixes three buckets in priority order, dedups by post id,
// and returns the trimmed list. We deliberately keep the queries simple — this is the
// degraded path; correctness and resilience matter, the perfect blend doesn't.
async function buildForYouFallbackIds(args: {
  db: Database
  viewerId: string
  limit: number
}): Promise<string[]> {
  const { db, viewerId, limit } = args
  const perBucket = Math.max(limit, 20)

  const [networkRows, followingRows, publicRows] = await Promise.all([
    db
      .select({ id: schema.posts.id, ts: schema.likes.createdAt })
      .from(schema.likes)
      .innerJoin(
        schema.follows,
        and(
          eq(schema.follows.followerId, viewerId),
          eq(schema.follows.followeeId, schema.likes.userId)
        )
      )
      .innerJoin(schema.posts, eq(schema.posts.id, schema.likes.postId))
      .where(
        and(
          isNull(schema.posts.deletedAt),
          eq(schema.posts.visibility, "public"),
          sql`NOT EXISTS (SELECT 1 FROM ${schema.follows} ff WHERE ff.follower_id = ${viewerId} AND ff.followee_id = ${schema.posts.authorId})`,
          sql`${schema.posts.authorId} <> ${viewerId}`,
          sql`NOT EXISTS (SELECT 1 FROM ${schema.blocks} b WHERE (b.blocker_id = ${viewerId} AND b.blocked_id = ${schema.posts.authorId}) OR (b.blocker_id = ${schema.posts.authorId} AND b.blocked_id = ${viewerId}))`,
          sql`NOT EXISTS (SELECT 1 FROM ${schema.mutes} m WHERE m.muter_id = ${viewerId} AND m.muted_id = ${schema.posts.authorId} AND (m.scope = 'feed' OR m.scope = 'both'))`
        )
      )
      .orderBy(desc(schema.likes.createdAt))
      .limit(perBucket),
    db
      .select({ id: schema.posts.id, ts: schema.posts.createdAt })
      .from(schema.posts)
      .innerJoin(
        schema.follows,
        eq(schema.follows.followeeId, schema.posts.authorId)
      )
      .where(
        and(
          eq(schema.follows.followerId, viewerId),
          isNull(schema.posts.deletedAt),
          sql`NOT EXISTS (SELECT 1 FROM ${schema.blocks} b WHERE (b.blocker_id = ${viewerId} AND b.blocked_id = ${schema.posts.authorId}) OR (b.blocker_id = ${schema.posts.authorId} AND b.blocked_id = ${viewerId}))`,
          sql`NOT EXISTS (SELECT 1 FROM ${schema.mutes} m WHERE m.muter_id = ${viewerId} AND m.muted_id = ${schema.posts.authorId} AND (m.scope = 'feed' OR m.scope = 'both'))`
        )
      )
      .orderBy(desc(schema.posts.createdAt))
      .limit(perBucket),
    db
      .select({ id: schema.posts.id, ts: schema.posts.createdAt })
      .from(schema.posts)
      .where(
        and(
          isNull(schema.posts.deletedAt),
          eq(schema.posts.visibility, "public"),
          sql`${schema.posts.authorId} <> ${viewerId}`,
          sql`NOT EXISTS (SELECT 1 FROM ${schema.follows} ff WHERE ff.follower_id = ${viewerId} AND ff.followee_id = ${schema.posts.authorId})`,
          sql`NOT EXISTS (SELECT 1 FROM ${schema.blocks} b WHERE (b.blocker_id = ${viewerId} AND b.blocked_id = ${schema.posts.authorId}) OR (b.blocker_id = ${schema.posts.authorId} AND b.blocked_id = ${viewerId}))`,
          sql`NOT EXISTS (SELECT 1 FROM ${schema.mutes} m WHERE m.muter_id = ${viewerId} AND m.muted_id = ${schema.posts.authorId} AND (m.scope = 'feed' OR m.scope = 'both'))`
        )
      )
      .orderBy(desc(schema.posts.createdAt))
      .limit(perBucket),
  ])

  const seen = new Set<string>()
  const ordered: string[] = []
  for (const bucket of [networkRows, followingRows, publicRows]) {
    for (const row of bucket) {
      if (seen.has(row.id)) continue
      seen.add(row.id)
      ordered.push(row.id)
      if (ordered.length >= limit) return ordered
    }
  }
  return ordered
}
