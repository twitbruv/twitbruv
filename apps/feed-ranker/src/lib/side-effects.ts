import {
  RANKED_SESSION_TTL_SECONDS,
  rankedSessionKey,
} from "./query-context.ts"
import { encodeSessionCursor } from "./cursor.ts"
import type { QueryContext } from "./query-context.ts"
import type { RankerRuntime } from "./runtime.ts"
import type { ScoredForYouCandidate } from "./scorers.ts"

export interface RankedSessionResult {
  postIds: Array<string>
  nextCursor: string | null
}

export async function persistRankedSession(
  context: QueryContext,
  selected: Array<ScoredForYouCandidate>,
  runtime: RankerRuntime
): Promise<RankedSessionResult> {
  const postIds = selected.map((candidate) => candidate.postId)
  const pagePostIds = postIds.slice(0, context.limit)

  if (postIds.length <= context.limit) {
    return { postIds: pagePostIds, nextCursor: null }
  }

  const sessionId = crypto.randomUUID()
  await runtime.redis.set(
    rankedSessionKey(sessionId),
    JSON.stringify({
      userId: context.userId,
      postIds,
      algoVersion: context.request.algoVersion,
      variant: context.request.variant,
      snapshotAt: context.requestedAt.toISOString(),
    }),
    "EX",
    RANKED_SESSION_TTL_SECONDS
  )

  return {
    postIds: pagePostIds,
    nextCursor: encodeSessionCursor({ sessionId, offset: context.limit }),
  }
}

export function recordRankerSideEffects(
  context: QueryContext,
  selected: Array<ScoredForYouCandidate>,
  runtime: RankerRuntime
): void {
  runtime.log.debug(
    {
      algoVersion: context.request.algoVersion,
      variant: context.request.variant,
      selected: selected.length,
      network: selected.filter(
        (candidate) => candidate.sourceBucket === "network"
      ).length,
      affinity: selected.filter(
        (candidate) => candidate.sourceBucket === "affinity"
      ).length,
      public: selected.filter(
        (candidate) => candidate.sourceBucket === "public"
      ).length,
    },
    "for_you_ranker_selection"
  )
}
