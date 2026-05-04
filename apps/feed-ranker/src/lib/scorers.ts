import type { ForYouCandidate } from "./candidates/index.ts"
import type { QueryContext } from "./query-context.ts"

export interface ScoredForYouCandidate extends ForYouCandidate {
  score: number
  scoreBreakdown: Record<string, number>
}

export function scoreCandidates(
  context: QueryContext,
  candidates: Array<ForYouCandidate>
): Array<ScoredForYouCandidate> {
  return candidates.map((candidate) => {
    const ageHours = Math.max(
      0,
      (context.requestedAt.getTime() - candidate.createdAt.getTime()) /
        (60 * 60 * 1000)
    )
    const networkProof =
      2.0 * candidate.networkRepostCount + 1.5 * candidate.networkLikeCount
    const affinity = 1.2 * Math.log1p(candidate.authorAffinityScore)
    const recent30m = 1.0 * Math.log1p(candidate.recentEngagement30m)
    const recent6h = 0.6 * Math.log1p(candidate.recentEngagement6h)
    const lifetimeEngagement =
      0.6 *
      Math.log1p(
        candidate.likeCount +
          candidate.repostCount * 2 +
          candidate.replyCount * 1.5 +
          candidate.quoteCount * 1.5
      )
    const recencyPenalty = -0.35 * ageHours
    const replyPenalty =
      candidate.replyToId && isWeakReply(candidate) ? -1.5 : 0
    const networkClassAdjustment = networkClassBoost(candidate)
    const sourceAdjustment = sourceBucketBoost(candidate)

    const scoreBreakdown = {
      networkProof,
      affinity,
      recent30m,
      recent6h,
      lifetimeEngagement,
      recencyPenalty,
      replyPenalty,
      networkClassAdjustment,
      sourceAdjustment,
    }
    const score = Object.values(scoreBreakdown).reduce(
      (sum, value) => sum + value,
      0
    )

    return {
      ...candidate,
      score,
      scoreBreakdown,
    }
  })
}

function isWeakReply(candidate: ForYouCandidate): boolean {
  return (
    candidate.networkLikeCount + candidate.networkRepostCount === 0 &&
    candidate.authorAffinityScore < 2 &&
    candidate.likeCount + candidate.repostCount * 2 + candidate.replyCount < 5
  )
}

function networkClassBoost(candidate: ForYouCandidate): number {
  switch (candidate.networkClass) {
    case "adjacent":
      return 0.35
    case "following":
      return 0.15
    case "discovery":
      return 0
  }
}

function sourceBucketBoost(candidate: ForYouCandidate): number {
  switch (candidate.sourceBucket) {
    case "network":
      return 0.5
    case "affinity":
      return 0.25
    case "public":
      return 0
  }
}
