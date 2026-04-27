import { and, gte, inArray, isNull, schema, sql } from "@workspace/db"
import type { ForYouNetworkClass, ForYouSourceBucket } from "@workspace/types"
import type { QueryContext } from "./query-context.ts"
import type { RankerRuntime } from "./runtime.ts"

export interface ForYouCandidate {
  postId: string
  authorId: string
  originalPostId: string | null
  sourceBucket: ForYouSourceBucket
  networkClass: ForYouNetworkClass
  createdAt: Date
  replyToId: string | null
  quoteOfId: string | null
  repostOfId: string | null
  likeCount: number
  repostCount: number
  replyCount: number
  quoteCount: number
  networkLikeCount: number
  networkRepostCount: number
  authorAffinityScore: number
  recentEngagement30m: number
  recentEngagement6h: number
  isFollowedAuthor: boolean
  activityAt: Date
}

export async function loadCandidates(
  context: QueryContext,
  runtime: RankerRuntime
): Promise<Array<ForYouCandidate>> {
  const [network, affinity, freshPublic] = await Promise.all([
    loadNetworkCandidates(context, runtime),
    loadAffinityCandidates(context, runtime),
    loadFreshPublicCandidates(context, runtime),
  ])

  const candidates = mergeCandidateSignals([
    ...network,
    ...affinity,
    ...freshPublic,
  ])
  await hydrateRecentEngagement(candidates, runtime)
  return candidates
}

type CandidateRow = {
  post_id: string
  author_id: string
  original_post_id: string | null
  created_at: Date | string
  reply_to_id: string | null
  quote_of_id: string | null
  repost_of_id: string | null
  like_count: number
  repost_count: number
  reply_count: number
  quote_count: number
  network_like_count: number
  network_repost_count: number
  author_affinity_score: number
  activity_at: Date | string
}

async function loadNetworkCandidates(
  context: QueryContext,
  runtime: RankerRuntime
): Promise<Array<ForYouCandidate>> {
  const rows = await runtime.db.execute(sql<CandidateRow>`
    WITH followees AS (
      SELECT followee_id
      FROM ${schema.follows}
      WHERE follower_id = ${context.userId}
    ),
    signals AS (
      SELECT l.post_id, l.user_id AS actor_id, 'like'::text AS kind, l.created_at AS activity_at
      FROM ${schema.likes} l
      INNER JOIN followees f ON f.followee_id = l.user_id
      WHERE l.created_at > now() - interval '7 days'

      UNION ALL

      SELECT r.repost_of_id AS post_id, r.author_id AS actor_id, 'repost'::text AS kind, r.created_at AS activity_at
      FROM ${schema.posts} r
      INNER JOIN followees f ON f.followee_id = r.author_id
      WHERE r.repost_of_id IS NOT NULL
        AND r.deleted_at IS NULL
        AND r.created_at > now() - interval '7 days'
    ),
    grouped AS (
      SELECT
        post_id,
        COUNT(DISTINCT actor_id) FILTER (WHERE kind = 'like')::int AS network_like_count,
        COUNT(DISTINCT actor_id) FILTER (WHERE kind = 'repost')::int AS network_repost_count,
        MAX(activity_at) AS activity_at
      FROM signals
      WHERE post_id IS NOT NULL
      GROUP BY post_id
    )
    SELECT
      p.id AS post_id,
      p.author_id,
      COALESCE(p.repost_of_id, p.id) AS original_post_id,
      p.created_at,
      p.reply_to_id,
      p.quote_of_id,
      p.repost_of_id,
      p.like_count,
      p.repost_count,
      p.reply_count,
      p.quote_count,
      grouped.network_like_count,
      grouped.network_repost_count,
      0::float AS author_affinity_score,
      grouped.activity_at
    FROM grouped
    INNER JOIN ${schema.posts} p ON p.id = grouped.post_id
    WHERE p.deleted_at IS NULL
      AND p.visibility = 'public'
      AND p.author_id <> ${context.userId}
      AND NOT EXISTS (
        SELECT 1 FROM ${schema.follows} ff
        WHERE ff.follower_id = ${context.userId}
          AND ff.followee_id = p.author_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM ${schema.blocks} b
        WHERE (b.blocker_id = ${context.userId} AND b.blocked_id = p.author_id)
           OR (b.blocker_id = p.author_id AND b.blocked_id = ${context.userId})
      )
      AND NOT EXISTS (
        SELECT 1 FROM ${schema.mutes} m
        WHERE m.muter_id = ${context.userId}
          AND m.muted_id = p.author_id
          AND (m.scope = 'feed' OR m.scope = 'both')
      )
    ORDER BY grouped.activity_at DESC
    LIMIT 120
  `)

  return (rows as unknown as Array<CandidateRow>).map((row) =>
    rowToCandidate(row, "network", "adjacent", context)
  )
}

async function loadAffinityCandidates(
  context: QueryContext,
  runtime: RankerRuntime
): Promise<Array<ForYouCandidate>> {
  const rows = await runtime.db.execute(sql<CandidateRow>`
    WITH affinity AS (
      SELECT author_id, SUM(weight)::float AS score
      FROM (
        SELECT p.author_id, 1.0 AS weight
        FROM ${schema.likes} l
        INNER JOIN ${schema.posts} p ON p.id = l.post_id
        WHERE l.user_id = ${context.userId}
          AND l.created_at > now() - interval '30 days'
          AND p.author_id <> ${context.userId}

        UNION ALL

        SELECT target.author_id, 1.6 AS weight
        FROM ${schema.posts} r
        INNER JOIN ${schema.posts} target ON target.id = r.repost_of_id
        WHERE r.author_id = ${context.userId}
          AND r.repost_of_id IS NOT NULL
          AND r.created_at > now() - interval '30 days'
          AND target.author_id <> ${context.userId}

        UNION ALL

        SELECT parent.author_id, 1.4 AS weight
        FROM ${schema.posts} reply
        INNER JOIN ${schema.posts} parent ON parent.id = reply.reply_to_id
        WHERE reply.author_id = ${context.userId}
          AND reply.reply_to_id IS NOT NULL
          AND reply.created_at > now() - interval '30 days'
          AND parent.author_id <> ${context.userId}

        UNION ALL

        SELECT p.author_id, 0.8 AS weight
        FROM ${schema.bookmarks} b
        INNER JOIN ${schema.posts} p ON p.id = b.post_id
        WHERE b.user_id = ${context.userId}
          AND b.created_at > now() - interval '30 days'
          AND p.author_id <> ${context.userId}
      ) interactions
      GROUP BY author_id
      ORDER BY score DESC
      LIMIT 40
    )
    SELECT
      p.id AS post_id,
      p.author_id,
      COALESCE(p.repost_of_id, p.id) AS original_post_id,
      p.created_at,
      p.reply_to_id,
      p.quote_of_id,
      p.repost_of_id,
      p.like_count,
      p.repost_count,
      p.reply_count,
      p.quote_count,
      0::int AS network_like_count,
      0::int AS network_repost_count,
      affinity.score AS author_affinity_score,
      p.created_at AS activity_at
    FROM affinity
    INNER JOIN ${schema.posts} p ON p.author_id = affinity.author_id
    WHERE p.deleted_at IS NULL
      AND p.visibility = 'public'
      AND p.author_id <> ${context.userId}
      AND p.repost_of_id IS NULL
      AND p.created_at > now() - interval '14 days'
      AND NOT EXISTS (
        SELECT 1 FROM ${schema.blocks} b
        WHERE (b.blocker_id = ${context.userId} AND b.blocked_id = p.author_id)
           OR (b.blocker_id = p.author_id AND b.blocked_id = ${context.userId})
      )
      AND NOT EXISTS (
        SELECT 1 FROM ${schema.mutes} m
        WHERE m.muter_id = ${context.userId}
          AND m.muted_id = p.author_id
          AND (m.scope = 'feed' OR m.scope = 'both')
      )
    ORDER BY affinity.score DESC, p.created_at DESC
    LIMIT 100
  `)

  return (rows as unknown as Array<CandidateRow>).map((row) =>
    rowToCandidate(
      row,
      "affinity",
      context.followedAuthorIds.has(row.author_id) ? "following" : "adjacent",
      context
    )
  )
}

async function loadFreshPublicCandidates(
  context: QueryContext,
  runtime: RankerRuntime
): Promise<Array<ForYouCandidate>> {
  const rows = await runtime.db.execute(sql<CandidateRow>`
    SELECT
      p.id AS post_id,
      p.author_id,
      COALESCE(p.repost_of_id, p.id) AS original_post_id,
      p.created_at,
      p.reply_to_id,
      p.quote_of_id,
      p.repost_of_id,
      p.like_count,
      p.repost_count,
      p.reply_count,
      p.quote_count,
      0::int AS network_like_count,
      0::int AS network_repost_count,
      0::float AS author_affinity_score,
      p.created_at AS activity_at
    FROM ${schema.posts} p
    WHERE p.deleted_at IS NULL
      AND p.visibility = 'public'
      AND p.author_id <> ${context.userId}
      AND p.repost_of_id IS NULL
      AND p.created_at > now() - interval '48 hours'
      AND (
        p.reply_to_id IS NULL
        OR (p.like_count + p.repost_count * 2 + p.reply_count + p.quote_count) >= 4
      )
      AND NOT EXISTS (
        SELECT 1 FROM ${schema.blocks} b
        WHERE (b.blocker_id = ${context.userId} AND b.blocked_id = p.author_id)
           OR (b.blocker_id = p.author_id AND b.blocked_id = ${context.userId})
      )
      AND NOT EXISTS (
        SELECT 1 FROM ${schema.mutes} m
        WHERE m.muter_id = ${context.userId}
          AND m.muted_id = p.author_id
          AND (m.scope = 'feed' OR m.scope = 'both')
      )
    ORDER BY p.created_at DESC
    LIMIT 120
  `)

  return (rows as unknown as Array<CandidateRow>).map((row) =>
    rowToCandidate(row, "public", "discovery", context)
  )
}

function rowToCandidate(
  row: CandidateRow,
  sourceBucket: ForYouSourceBucket,
  networkClass: ForYouNetworkClass,
  context: QueryContext
): ForYouCandidate {
  return {
    postId: row.post_id,
    authorId: row.author_id,
    originalPostId: row.original_post_id,
    sourceBucket,
    networkClass,
    createdAt: asDate(row.created_at),
    replyToId: row.reply_to_id,
    quoteOfId: row.quote_of_id,
    repostOfId: row.repost_of_id,
    likeCount: Number(row.like_count),
    repostCount: Number(row.repost_count),
    replyCount: Number(row.reply_count),
    quoteCount: Number(row.quote_count),
    networkLikeCount: Number(row.network_like_count),
    networkRepostCount: Number(row.network_repost_count),
    authorAffinityScore: Number(row.author_affinity_score),
    recentEngagement30m: 0,
    recentEngagement6h: 0,
    isFollowedAuthor: context.followedAuthorIds.has(row.author_id),
    activityAt: asDate(row.activity_at),
  }
}

function mergeCandidateSignals(
  candidates: Array<ForYouCandidate>
): Array<ForYouCandidate> {
  const byId = new Map<string, ForYouCandidate>()
  const sourcePriority: Record<ForYouSourceBucket, number> = {
    network: 3,
    affinity: 2,
    public: 1,
  }

  for (const candidate of candidates) {
    const existing = byId.get(candidate.postId)
    if (!existing) {
      byId.set(candidate.postId, candidate)
      continue
    }

    existing.networkLikeCount = Math.max(
      existing.networkLikeCount,
      candidate.networkLikeCount
    )
    existing.networkRepostCount = Math.max(
      existing.networkRepostCount,
      candidate.networkRepostCount
    )
    existing.authorAffinityScore = Math.max(
      existing.authorAffinityScore,
      candidate.authorAffinityScore
    )
    if (candidate.activityAt > existing.activityAt)
      existing.activityAt = candidate.activityAt
    if (
      sourcePriority[candidate.sourceBucket] >
      sourcePriority[existing.sourceBucket]
    ) {
      existing.sourceBucket = candidate.sourceBucket
      existing.networkClass = candidate.networkClass
    }
  }

  return [...byId.values()].slice(0, 250)
}

async function hydrateRecentEngagement(
  candidates: Array<ForYouCandidate>,
  runtime: RankerRuntime
): Promise<void> {
  const ids = candidates.map((candidate) => candidate.postId)
  if (ids.length === 0) return

  const candidateById = new Map(
    candidates.map((candidate) => [candidate.postId, candidate])
  )
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000)
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000)

  const [
    likes30m,
    likes6h,
    reposts30m,
    reposts6h,
    replies30m,
    replies6h,
    quotes30m,
    quotes6h,
  ] = await Promise.all([
    countRecentByColumn("likes", "postId", ids, thirtyMinutesAgo, runtime),
    countRecentByColumn("likes", "postId", ids, sixHoursAgo, runtime),
    countRecentByColumn("posts", "repostOfId", ids, thirtyMinutesAgo, runtime),
    countRecentByColumn("posts", "repostOfId", ids, sixHoursAgo, runtime),
    countRecentByColumn("posts", "replyToId", ids, thirtyMinutesAgo, runtime),
    countRecentByColumn("posts", "replyToId", ids, sixHoursAgo, runtime),
    countRecentByColumn("posts", "quoteOfId", ids, thirtyMinutesAgo, runtime),
    countRecentByColumn("posts", "quoteOfId", ids, sixHoursAgo, runtime),
  ])

  for (const [postId, candidate] of candidateById) {
    candidate.recentEngagement30m =
      (likes30m.get(postId) ?? 0) +
      (reposts30m.get(postId) ?? 0) * 2 +
      (replies30m.get(postId) ?? 0) * 1.5 +
      (quotes30m.get(postId) ?? 0) * 1.5
    candidate.recentEngagement6h =
      (likes6h.get(postId) ?? 0) +
      (reposts6h.get(postId) ?? 0) * 2 +
      (replies6h.get(postId) ?? 0) * 1.5 +
      (quotes6h.get(postId) ?? 0) * 1.5
  }
}

async function countRecentByColumn(
  table: "likes" | "posts",
  column: "postId" | "repostOfId" | "replyToId" | "quoteOfId",
  ids: Array<string>,
  since: Date,
  runtime: RankerRuntime
): Promise<Map<string, number>> {
  if (table === "likes") {
    const rows = await runtime.db
      .select({
        postId: schema.likes.postId,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(schema.likes)
      .where(
        and(
          inArray(schema.likes.postId, ids),
          gte(schema.likes.createdAt, since)
        )
      )
      .groupBy(schema.likes.postId)

    return new Map(rows.map((row) => [row.postId, Number(row.count)]))
  }

  const postColumn = postRelationshipColumn(column)
  const rows = await runtime.db
    .select({
      postId: postColumn,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(schema.posts)
    .where(
      and(
        inArray(postColumn, ids),
        gte(schema.posts.createdAt, since),
        isNull(schema.posts.deletedAt)
      )
    )
    .groupBy(postColumn)

  return new Map(
    rows
      .filter(
        (row): row is { postId: string; count: number } =>
          typeof row.postId === "string"
      )
      .map((row) => [row.postId, Number(row.count)])
  )
}

function postRelationshipColumn(
  column: "postId" | "repostOfId" | "replyToId" | "quoteOfId"
) {
  switch (column) {
    case "repostOfId":
      return schema.posts.repostOfId
    case "replyToId":
      return schema.posts.replyToId
    case "quoteOfId":
      return schema.posts.quoteOfId
    case "postId":
      throw new Error("postId is not a posts relationship column")
  }
}

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value)
}
