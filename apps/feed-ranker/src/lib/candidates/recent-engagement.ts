import { and, gte, inArray, isNull, schema, sql } from "@workspace/db"
import type { ForYouCandidate } from "./types.ts"
import type { RankerRuntime } from "../runtime.ts"

export async function hydrateRecentEngagement(
  candidates: Array<ForYouCandidate>,
  runtime: RankerRuntime,
  requestedAt: Date
): Promise<void> {
  const ids = candidates.map((candidate) => candidate.postId)
  if (ids.length === 0) return

  const candidateById = new Map(
    candidates.map((candidate) => [candidate.postId, candidate])
  )
  const now = requestedAt.getTime()
  const thirtyMinutesAgo = new Date(now - 30 * 60 * 1000)
  const sixHoursAgo = new Date(now - 6 * 60 * 60 * 1000)

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
    countRecentLikes(ids, thirtyMinutesAgo, runtime),
    countRecentLikes(ids, sixHoursAgo, runtime),
    countRecentPostRelations("repostOfId", ids, thirtyMinutesAgo, runtime),
    countRecentPostRelations("repostOfId", ids, sixHoursAgo, runtime),
    countRecentPostRelations("replyToId", ids, thirtyMinutesAgo, runtime),
    countRecentPostRelations("replyToId", ids, sixHoursAgo, runtime),
    countRecentPostRelations("quoteOfId", ids, thirtyMinutesAgo, runtime),
    countRecentPostRelations("quoteOfId", ids, sixHoursAgo, runtime),
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

async function countRecentLikes(
  ids: Array<string>,
  since: Date,
  runtime: RankerRuntime
): Promise<Map<string, number>> {
  const rows = await runtime.db
    .select({
      postId: schema.likes.postId,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(schema.likes)
    .where(
      and(inArray(schema.likes.postId, ids), gte(schema.likes.createdAt, since))
    )
    .groupBy(schema.likes.postId)

  return new Map(rows.map((row) => [row.postId, Number(row.count)]))
}

async function countRecentPostRelations(
  column: "repostOfId" | "replyToId" | "quoteOfId",
  ids: Array<string>,
  since: Date,
  runtime: RankerRuntime
): Promise<Map<string, number>> {
  const postColumn = schema.posts[column]
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
