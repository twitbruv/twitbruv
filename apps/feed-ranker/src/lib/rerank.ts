import type { QueryContext } from "./query-context.ts"
import type { ScoredForYouCandidate } from "./scorers.ts"

export function selectRankedCandidates(
  context: QueryContext,
  candidates: ScoredForYouCandidate[]
): ScoredForYouCandidate[] {
  return candidates.slice(0, context.limit)
}
