import {
  and,
  desc,
  eligiblePublicFeedPost,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  schema,
} from "@workspace/db"
import type { ForYouCandidate } from "./types.ts"
import type { QueryContext } from "../query-context.ts"
import type { RankerRuntime } from "../runtime.ts"

const NETWORK_SIGNAL_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

export async function loadNetworkCandidates(
  context: QueryContext,
  runtime: RankerRuntime
): Promise<Array<ForYouCandidate>> {
  const followeeIds = [...context.followedAuthorIds]
  if (followeeIds.length === 0) return []

  const since = new Date(
    context.requestedAt.getTime() - NETWORK_SIGNAL_WINDOW_MS
  )
  const [likeSignals, repostSignals] = await Promise.all([
    loadLikeSignals(runtime, followeeIds, since),
    loadRepostSignals(runtime, followeeIds, since),
  ])
  const signals = mergeNetworkSignals([...likeSignals, ...repostSignals])
  const postIds = [...signals.keys()]
  if (postIds.length === 0) return []

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
    })
    .from(schema.posts)
    .where(
      and(
        eligiblePublicFeedPost(context.userId),
        inArray(schema.posts.id, postIds)
      )
    )

  return rows
    .filter((row) => !context.followedAuthorIds.has(row.authorId))
    .map((row) => {
      const signal = signals.get(row.postId)!
      return {
        ...row,
        sourceBucket: "network" as const,
        networkClass: "adjacent" as const,
        originalPostId: row.repostOfId ?? row.originalPostId,
        networkLikeCount: signal.likeActorIds.size,
        networkRepostCount: signal.repostActorIds.size,
        authorAffinityScore: 0,
        recentEngagement30m: 0,
        recentEngagement6h: 0,
        isFollowedAuthor: false,
        activityAt: signal.activityAt,
      }
    })
    .sort((a, b) => b.activityAt.getTime() - a.activityAt.getTime())
    .slice(0, 120)
}

type NetworkSignalKind = "like" | "repost"

interface RawNetworkSignal {
  postId: string
  actorId: string
  kind: NetworkSignalKind
  activityAt: Date
}

interface MergedNetworkSignal {
  likeActorIds: Set<string>
  repostActorIds: Set<string>
  activityAt: Date
}

async function loadLikeSignals(
  runtime: RankerRuntime,
  followeeIds: Array<string>,
  since: Date
): Promise<Array<RawNetworkSignal>> {
  const rows = await runtime.db
    .select({
      postId: schema.likes.postId,
      originalPostId: schema.posts.repostOfId,
      actorId: schema.likes.userId,
      activityAt: schema.likes.createdAt,
    })
    .from(schema.likes)
    .innerJoin(schema.posts, eq(schema.posts.id, schema.likes.postId))
    .where(
      and(
        inArray(schema.likes.userId, followeeIds),
        gte(schema.likes.createdAt, since)
      )
    )
    .orderBy(desc(schema.likes.createdAt))
    .limit(240)

  return rows.map((row) => ({
    postId: row.originalPostId ?? row.postId,
    actorId: row.actorId,
    activityAt: row.activityAt,
    kind: "like",
  }))
}

async function loadRepostSignals(
  runtime: RankerRuntime,
  followeeIds: Array<string>,
  since: Date
): Promise<Array<RawNetworkSignal>> {
  const rows = await runtime.db
    .select({
      postId: schema.posts.repostOfId,
      actorId: schema.posts.authorId,
      activityAt: schema.posts.createdAt,
    })
    .from(schema.posts)
    .where(
      and(
        inArray(schema.posts.authorId, followeeIds),
        isNotNull(schema.posts.repostOfId),
        isNull(schema.posts.deletedAt),
        gte(schema.posts.createdAt, since)
      )
    )
    .orderBy(desc(schema.posts.createdAt))
    .limit(240)

  return rows
    .filter(
      (row): row is { postId: string; actorId: string; activityAt: Date } =>
        typeof row.postId === "string"
    )
    .map((row) => ({ ...row, kind: "repost" }))
}

function mergeNetworkSignals(
  signals: Array<RawNetworkSignal>
): Map<string, MergedNetworkSignal> {
  const byPostId = new Map<string, MergedNetworkSignal>()

  for (const signal of signals) {
    const existing = byPostId.get(signal.postId) ?? {
      likeActorIds: new Set<string>(),
      repostActorIds: new Set<string>(),
      activityAt: signal.activityAt,
    }

    if (signal.kind === "like") {
      existing.likeActorIds.add(signal.actorId)
    } else {
      existing.repostActorIds.add(signal.actorId)
    }
    if (signal.activityAt > existing.activityAt) {
      existing.activityAt = signal.activityAt
    }
    byPostId.set(signal.postId, existing)
  }

  return byPostId
}
