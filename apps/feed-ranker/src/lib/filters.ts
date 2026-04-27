import type { ForYouCandidate } from "./candidates.ts"
import type { QueryContext } from "./query-context.ts"

export function applyPreScoringFilters(
  _context: QueryContext,
  candidates: ForYouCandidate[]
): ForYouCandidate[] {
  return candidates
}
