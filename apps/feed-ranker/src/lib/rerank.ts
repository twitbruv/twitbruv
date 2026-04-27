import type { QueryContext } from "./query-context.ts"
import type { ScoredForYouCandidate } from "./scorers.ts"

export function selectRankedCandidates(
  context: QueryContext,
  candidates: Array<ScoredForYouCandidate>
): Array<ScoredForYouCandidate> {
  const targetSize = Math.min(
    250,
    Math.max(context.limit * 4, 200),
    candidates.length
  )
  const remaining = [...candidates].sort((a, b) => b.score - a.score)
  const selected: Array<ScoredForYouCandidate> = []
  const authorCounts = new Map<string, number>()
  const sourceCounts = new Map<string, number>()
  let followedInFirstTwenty = 0
  let repliesInFirstTwenty = 0

  while (remaining.length > 0 && selected.length < targetSize) {
    let bestIndex = -1
    let bestAdjustedScore = Number.NEGATIVE_INFINITY

    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index]!
      if (
        !canSelectInTopWindow(
          candidate,
          selected.length,
          authorCounts,
          sourceCounts,
          followedInFirstTwenty,
          repliesInFirstTwenty
        )
      ) {
        continue
      }

      const adjustedScore = adjustedRerankScore(
        candidate,
        selected.length,
        authorCounts,
        sourceCounts
      )
      if (adjustedScore > bestAdjustedScore) {
        bestAdjustedScore = adjustedScore
        bestIndex = index
      }
    }

    if (bestIndex === -1) {
      const fallback = bestRemainingCandidate(
        remaining,
        selected.length,
        authorCounts,
        sourceCounts
      )
      bestIndex = fallback.index
      bestAdjustedScore = fallback.adjustedScore
    }

    if (bestIndex === -1) break

    const [candidate] = remaining.splice(bestIndex, 1)
    if (!candidate) break

    const authorCount = authorCounts.get(candidate.authorId) ?? 0
    const sourceCount = sourceCounts.get(candidate.sourceBucket) ?? 0
    authorCounts.set(candidate.authorId, authorCount + 1)
    sourceCounts.set(candidate.sourceBucket, sourceCount + 1)
    if (selected.length < 20 && candidate.isFollowedAuthor)
      followedInFirstTwenty += 1
    if (selected.length < 20 && candidate.replyToId) repliesInFirstTwenty += 1

    selected.push({
      ...candidate,
      score: bestAdjustedScore,
      scoreBreakdown: {
        ...candidate.scoreBreakdown,
        rerankAdjustment: bestAdjustedScore - candidate.score,
      },
    })
  }

  return selected
}

function bestRemainingCandidate(
  remaining: Array<ScoredForYouCandidate>,
  index: number,
  authorCounts: Map<string, number>,
  sourceCounts: Map<string, number>
): { index: number; adjustedScore: number } {
  let bestIndex = -1
  let bestAdjustedScore = Number.NEGATIVE_INFINITY

  for (
    let candidateIndex = 0;
    candidateIndex < remaining.length;
    candidateIndex += 1
  ) {
    const candidate = remaining[candidateIndex]!
    const adjustedScore = adjustedRerankScore(
      candidate,
      index,
      authorCounts,
      sourceCounts
    )
    if (adjustedScore > bestAdjustedScore) {
      bestAdjustedScore = adjustedScore
      bestIndex = candidateIndex
    }
  }

  return { index: bestIndex, adjustedScore: bestAdjustedScore }
}

function canSelectInTopWindow(
  candidate: ScoredForYouCandidate,
  index: number,
  authorCounts: Map<string, number>,
  sourceCounts: Map<string, number>,
  followedInFirstTwenty: number,
  repliesInFirstTwenty: number
): boolean {
  if (index >= 20) return true

  if ((authorCounts.get(candidate.authorId) ?? 0) >= 2) return false
  if (candidate.isFollowedAuthor && followedInFirstTwenty >= 5) return false
  if (candidate.replyToId && repliesInFirstTwenty >= 6) return false

  const sourceCount = sourceCounts.get(candidate.sourceBucket) ?? 0
  if (sourceCount >= 12) return false

  return true
}

function adjustedRerankScore(
  candidate: ScoredForYouCandidate,
  index: number,
  authorCounts: Map<string, number>,
  sourceCounts: Map<string, number>
): number {
  const authorRepeats = authorCounts.get(candidate.authorId) ?? 0
  const sourceRepeats = sourceCounts.get(candidate.sourceBucket) ?? 0
  const authorAttenuation =
    authorRepeats === 0 ? 1 : authorRepeats === 1 ? 0.72 : 0.5
  const sourcePenalty = index < 20 ? sourceRepeats * 0.08 : sourceRepeats * 0.03
  const replyPenalty = index < 20 && candidate.replyToId ? 0.35 : 0
  const freshnessNudge = index < 10 ? freshnessNudgeFor(candidate) : 0
  const authorFactor =
    candidate.score >= 0 ? authorAttenuation : 1 + (1 - authorAttenuation)

  return (
    candidate.score * authorFactor -
    sourcePenalty -
    replyPenalty +
    freshnessNudge
  )
}

function freshnessNudgeFor(candidate: ScoredForYouCandidate): number {
  const ageHours = Math.max(
    0,
    (Date.now() - candidate.createdAt.getTime()) / (60 * 60 * 1000)
  )
  if (ageHours <= 3) return 0.4
  if (ageHours <= 12) return 0.2
  return 0
}
