import {
  and,
  desc,
  eligiblePublicFeedPost,
  eq,
  gte,
  isNull,
  or,
  schema,
  sql,
} from "@workspace/db"
import type { ForYouCandidate } from "./types.ts"
import type { QueryContext } from "../query-context.ts"
import type { RankerRuntime } from "../runtime.ts"

export async function loadFreshPublicCandidates(
  context: QueryContext,
  runtime: RankerRuntime
): Promise<Array<ForYouCandidate>> {
  const since = new Date(context.requestedAt.getTime() - 48 * 60 * 60 * 1000)
  const rows = await runtime.db
    .select({
      postId: schema.posts.id,
      authorId: schema.posts.authorId,
      originalPostId: sql<string>`COALESCE(${schema.posts.repostOfId}, ${schema.posts.id})`,
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
        isNull(schema.posts.repostOfId),
        gte(schema.posts.createdAt, since),
        or(
          isNull(schema.posts.replyToId),
          sql`(${schema.posts.likeCount} + ${schema.posts.repostCount} * 2 + ${schema.posts.replyCount} + ${schema.posts.quoteCount}) >= 4`
        ),
        eq(schema.posts.visibility, "public")
      )
    )
    .orderBy(desc(schema.posts.createdAt))
    .limit(120)

  return rows.map((row) => ({
    ...row,
    sourceBucket: "public",
    networkClass: "discovery",
    networkLikeCount: 0,
    networkRepostCount: 0,
    authorAffinityScore: 0,
    recentEngagement30m: 0,
    recentEngagement6h: 0,
    isFollowedAuthor: context.followedAuthorIds.has(row.authorId),
  }))
}
