import { hashUserId } from "./anonymize.ts"
import { loadCandidates } from "./candidates/index.ts"
import { applyPreScoringFilters } from "./filters.ts"
import { hydrateQueryContext } from "./query-context.ts"
import { encodeSessionCursor } from "./cursor.ts"
import { selectRankedCandidates } from "./rerank.ts"
import { scoreCandidates } from "./scorers.ts"
import {
  persistRankedSession,
  recordRankerSideEffects,
} from "./side-effects.ts"
import type { RankerRuntime } from "./runtime.ts"
import type { ForYouRankRequest, ForYouRankResponse } from "@workspace/types"

export async function runForYouPipeline(
  request: ForYouRankRequest,
  runtime: RankerRuntime
): Promise<ForYouRankResponse> {
  const context = await hydrateQueryContext(request, runtime)

  if (context.rankedSession) {
    const pagePostIds = context.rankedSession.postIds.slice(
      context.rankedSession.offset,
      context.rankedSession.offset + context.limit
    )
    const nextOffset = context.rankedSession.offset + pagePostIds.length
    const nextCursor =
      nextOffset < context.rankedSession.postIds.length
        ? encodeSessionCursor({
            sessionId: context.rankedSession.sessionId,
            offset: nextOffset,
          })
        : null

    runtime.log.info(
      {
        anonymizedUserId: hashUserId(
          request.userId,
          runtime.env.INTERNAL_SERVICE_TOKEN
        ),
        algoVersion: request.algoVersion,
        variant: request.variant,
        sessionId: context.rankedSession.sessionId,
        offset: context.rankedSession.offset,
        returned: pagePostIds.length,
      },
      "for_you_ranked_session_page"
    )

    return {
      postIds: pagePostIds,
      nextCursor,
      algoVersion: request.algoVersion,
      variant: request.variant,
    }
  }

  const candidates = await loadCandidates(context, runtime)
  const filtered = applyPreScoringFilters(context, candidates)
  const scored = scoreCandidates(context, filtered)
  const selected = selectRankedCandidates(context, scored)
  const session = await persistRankedSession(context, selected, runtime)
  recordRankerSideEffects(context, selected, runtime)

  runtime.log.info(
    {
      anonymizedUserId: hashUserId(
        request.userId,
        runtime.env.INTERNAL_SERVICE_TOKEN
      ),
      algoVersion: request.algoVersion,
      variant: request.variant,
      candidates: candidates.length,
      filtered: filtered.length,
      selected: selected.length,
      returned: session.postIds.length,
    },
    "for_you_ranked"
  )

  return {
    postIds: session.postIds,
    nextCursor: session.nextCursor,
    algoVersion: request.algoVersion,
    variant: request.variant,
  }
}
