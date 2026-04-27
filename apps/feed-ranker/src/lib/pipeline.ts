import type { Database } from "@workspace/db"
import type { ForYouRankRequest, ForYouRankResponse } from "@workspace/types"
import type Redis from "ioredis"
import type { Env } from "../env.ts"
import type { Logger } from "./logger.ts"
import { loadCandidates } from "./candidates.ts"
import { applyPreScoringFilters } from "./filters.ts"
import { hydrateQueryContext } from "./query-context.ts"
import { selectRankedCandidates } from "./rerank.ts"
import { scoreCandidates } from "./scorers.ts"
import { persistRankedSession, recordRankerSideEffects } from "./side-effects.ts"

export interface RankerRuntime {
  env: Env
  db: Database
  redis: Redis
  log: Logger
}

export async function runForYouPipeline(
  runtime: RankerRuntime,
  request: ForYouRankRequest
): Promise<ForYouRankResponse> {
  const context = await hydrateQueryContext(request)
  const candidates = await loadCandidates(context)
  const filtered = applyPreScoringFilters(context, candidates)
  const scored = scoreCandidates(context, filtered)
  const selected = selectRankedCandidates(context, scored)
  const session = await persistRankedSession(context, selected)
  await recordRankerSideEffects(context, selected)

  runtime.log.info(
    {
      userId: request.userId,
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
