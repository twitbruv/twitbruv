import type { QueryContext } from "./query-context.ts"
import type { RankerRuntime } from "./runtime.ts"
import type { ScoredForYouCandidate } from "./scorers.ts"

export interface RankedSessionResult {
  nextCursor: string | null
}

export async function persistRankedSession(
  _context: QueryContext,
  _selected: ScoredForYouCandidate[],
  _runtime: RankerRuntime
): Promise<RankedSessionResult> {
  return { nextCursor: null }
}

export async function recordRankerSideEffects(
  _context: QueryContext,
  _selected: ScoredForYouCandidate[],
  _runtime: RankerRuntime
): Promise<void> {
  // Request logging/cache hooks will live here once the ranker performs real work.
}
