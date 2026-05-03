import {
  and,
  asc,
  desc,
  eligiblePublicFeedPost,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  ne,
  schema,
} from "@workspace/db"
import type { ForYouCandidate } from "./types.ts"
import type { QueryContext } from "../query-context.ts"
import type { RankerRuntime } from "../runtime.ts"

const AFFINITY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000
const AFFINITY_POST_WINDOW_MS = 14 * 24 * 60 * 60 * 1000
const LIKE_WEIGHT = 1.0
const REPOST_WEIGHT = 1.6
const REPLY_WEIGHT = 1.4
const BOOKMARK_WEIGHT = 0.8

export async function loadAffinityCandidates(
  context: QueryContext,
  runtime: RankerRuntime
): Promise<Array<ForYouCandidate>> {
  const authorScores = await loadAffinityAuthorScores(context, runtime)
  if (authorScores.size === 0) return []

  const topAuthorIds = [...authorScores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 40)
    .map(([authorId]) => authorId)
  const since = new Date(
    context.requestedAt.getTime() - AFFINITY_POST_WINDOW_MS
  )

  const rows = await runtime.db
    .select({
      postId: schema.posts.id,
      authorId: schema.posts.authorId,
      originalPostId: schema.posts.id,
      createdAt: schema.posts.createdAt,
      replyToId: schema.posts.replyToId,
      quoteOfId: schema.posts.quoteOfId,
      repostOfId: schema.posts.repostOfId,
      likeCount: schema.posts.likeCount,
      repostCount: schema.posts.repostCount,
      replyCount: schema.posts.replyCount,
      quoteCount: schema.posts.quoteCount,
      activityAt: schema.posts.createdAt,
    })
    .from(schema.posts)
    .where(
      and(
        eligiblePublicFeedPost(context.userId),
        inArray(schema.posts.authorId, topAuthorIds),
        isNull(schema.posts.repostOfId),
        gte(schema.posts.createdAt, since)
      )
    )
    .orderBy(desc(schema.posts.createdAt))

  return rows
    .map((row) => ({
      ...row,
      sourceBucket: "affinity" as const,
      networkClass: context.followedAuthorIds.has(row.authorId)
        ? ("following" as const)
        : ("adjacent" as const),
      networkLikeCount: 0,
      networkRepostCount: 0,
      authorAffinityScore: authorScores.get(row.authorId) ?? 0,
      recentEngagement30m: 0,
      recentEngagement6h: 0,
      isFollowedAuthor: context.followedAuthorIds.has(row.authorId),
    }))
    .sort(
      (a, b) =>
        b.authorAffinityScore - a.authorAffinityScore ||
        b.createdAt.getTime() - a.createdAt.getTime()
    )
    .slice(0, 100)
}

async function loadAffinityAuthorScores(
  context: QueryContext,
  runtime: RankerRuntime
): Promise<Map<string, number>> {
  const since = new Date(context.requestedAt.getTime() - AFFINITY_WINDOW_MS)
  const [likedAuthors, bookmarkedAuthors, repostTargetIds, replyTargetIds] =
    await Promise.all([
      loadDirectInteractionAuthors(context, runtime, since, "like"),
      loadDirectInteractionAuthors(context, runtime, since, "bookmark"),
      loadViewerRelationTargetIds(context, runtime, since, "repostOfId"),
      loadViewerRelationTargetIds(context, runtime, since, "replyToId"),
    ])

  const [repostedAuthors, repliedToAuthors] = await Promise.all([
    loadTargetPostAuthors(context, runtime, repostTargetIds),
    loadTargetPostAuthors(context, runtime, replyTargetIds),
  ])

  const authorScores = new Map<string, number>()
  addAuthorScores(authorScores, likedAuthors, LIKE_WEIGHT)
  addAuthorScores(authorScores, bookmarkedAuthors, BOOKMARK_WEIGHT)
  addAuthorScores(authorScores, repostedAuthors, REPOST_WEIGHT)
  addAuthorScores(authorScores, repliedToAuthors, REPLY_WEIGHT)
  return authorScores
}

async function loadDirectInteractionAuthors(
  context: QueryContext,
  runtime: RankerRuntime,
  since: Date,
  source: "like" | "bookmark"
): Promise<Array<string>> {
  const interactionTable = source === "like" ? schema.likes : schema.bookmarks
  const rows = await runtime.db
    .select({ authorId: schema.posts.authorId })
    .from(interactionTable)
    .innerJoin(schema.posts, eq(schema.posts.id, interactionTable.postId))
    .where(
      and(
        eq(interactionTable.userId, context.userId),
        gte(interactionTable.createdAt, since),
        ne(schema.posts.authorId, context.userId)
      )
    )
    .orderBy(desc(interactionTable.createdAt), asc(schema.posts.id))
    .limit(500)

  return rows.map((row) => row.authorId)
}

async function loadViewerRelationTargetIds(
  context: QueryContext,
  runtime: RankerRuntime,
  since: Date,
  column: "repostOfId" | "replyToId"
): Promise<Array<string>> {
  const relationColumn = schema.posts[column]
  const rows = await runtime.db
    .select({ postId: relationColumn })
    .from(schema.posts)
    .where(
      and(
        eq(schema.posts.authorId, context.userId),
        isNotNull(relationColumn),
        gte(schema.posts.createdAt, since),
        isNull(schema.posts.deletedAt)
      )
    )
    .orderBy(desc(schema.posts.createdAt), asc(schema.posts.id))
    .limit(500)

  return rows
    .map((row) => row.postId)
    .filter((postId): postId is string => typeof postId === "string")
}

async function loadTargetPostAuthors(
  context: QueryContext,
  runtime: RankerRuntime,
  postIds: Array<string>
): Promise<Array<string>> {
  if (postIds.length === 0) return []

  const rows = await runtime.db
    .select({ authorId: schema.posts.authorId })
    .from(schema.posts)
    .where(
      and(
        inArray(schema.posts.id, postIds),
        ne(schema.posts.authorId, context.userId)
      )
    )

  return rows.map((row) => row.authorId)
}

function addAuthorScores(
  scores: Map<string, number>,
  authorIds: Array<string>,
  weight: number
): void {
  for (const authorId of authorIds) {
    scores.set(authorId, (scores.get(authorId) ?? 0) + weight)
  }
}
