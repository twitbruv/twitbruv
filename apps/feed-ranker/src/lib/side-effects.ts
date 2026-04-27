import type { QueryContext } from "./query-context.ts"
import type { ScoredForYouCandidate } from "./scorers.ts"

export interface RankedSessionResult {
  nextCursor: string | null
}

export async function persistRankedSession(
  _context: QueryContext,
  _selected: ScoredForYouCandidate[]
): Promise<RankedSessionResult> {
  return { nextCursor: null }
}

export async function recordRankerSideEffects(
  _context: QueryContext,
  _selected: ScoredForYouCandidate[]
): Promise<void> {
  // Request logging/cache hooks will live here once the ranker performs real work.
}
