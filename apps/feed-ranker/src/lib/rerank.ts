import type { QueryContext } from "./query-context.ts"
import type { ScoredForYouCandidate } from "./scorers.ts"

export function selectRankedCandidates(
  context: QueryContext,
  candidates: ScoredForYouCandidate[]
): ScoredForYouCandidate[] {
  const normalizedLimit = Math.min(
    Math.max(Number.isFinite(context.limit) ? Math.floor(context.limit) : 0, 0),
    candidates.length
  )
  return candidates.slice(0, normalizedLimit)
}
