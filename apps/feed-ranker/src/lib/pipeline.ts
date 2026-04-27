import type { ForYouRankRequest, ForYouRankResponse } from "@workspace/types"
import { hashUserId } from "./anonymize.ts"
import { loadCandidates } from "./candidates.ts"
import { applyPreScoringFilters } from "./filters.ts"
import { hydrateQueryContext } from "./query-context.ts"
import { selectRankedCandidates } from "./rerank.ts"
import type { RankerRuntime } from "./runtime.ts"
import { scoreCandidates } from "./scorers.ts"
import { persistRankedSession, recordRankerSideEffects } from "./side-effects.ts"

export async function runForYouPipeline(
  request: ForYouRankRequest,
  runtime: RankerRuntime
): Promise<ForYouRankResponse> {
  const context = await hydrateQueryContext(request)
  const candidates = await loadCandidates(context, runtime)
  const filtered = applyPreScoringFilters(context, candidates)
  const scored = scoreCandidates(context, filtered)
  const selected = selectRankedCandidates(context, scored)
  const session = await persistRankedSession(context, selected, runtime)
  await recordRankerSideEffects(context, selected, runtime)

  runtime.log.info(
    {
      anonymizedUserId: hashUserId(request.userId),
      algoVersion: request.algoVersion,
      variant: request.variant,
      candidates: candidates.length,
      selected: selected.length,
    },
    "for_you_ranked"
  )

  return {
    postIds: selected.map((candidate) => candidate.postId),
    nextCursor: session.nextCursor,
    algoVersion: request.algoVersion,
    variant: request.variant,
  }
}
