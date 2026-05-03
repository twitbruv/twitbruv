import type { ForYouCandidate } from "./candidates.ts"
import type { QueryContext } from "./query-context.ts"

export interface ScoredForYouCandidate extends ForYouCandidate {
  score: number
  scoreBreakdown: Record<string, number>
}

export function scoreCandidates(
  _context: QueryContext,
  candidates: ForYouCandidate[]
): ScoredForYouCandidate[] {
  return candidates.map((candidate) => ({
    ...candidate,
    score: 0,
    scoreBreakdown: {},
  }))
}
