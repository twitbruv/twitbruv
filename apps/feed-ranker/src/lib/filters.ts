import type { ForYouCandidate } from "./candidates/index.ts"
import type { QueryContext } from "./query-context.ts"

export function applyPreScoringFilters(
  context: QueryContext,
  candidates: Array<ForYouCandidate>
): Array<ForYouCandidate> {
  const bySemanticPost = new Map<string, ForYouCandidate>()
  const maxAgeMs = 14 * 24 * 60 * 60 * 1000
  const now = context.requestedAt.getTime()

  for (const candidate of candidates) {
    const semanticKey = candidate.originalPostId ?? candidate.postId
    if (candidate.authorId === context.userId) continue
    if (context.servedPostIds.has(semanticKey)) continue
    if (context.seenPostIds.has(semanticKey)) continue
    if (now - candidate.createdAt.getTime() > maxAgeMs) continue
    if (isLowSignalReply(candidate)) continue

    const existing = bySemanticPost.get(semanticKey)
    if (!existing || candidateQuality(candidate) > candidateQuality(existing)) {
      bySemanticPost.set(semanticKey, candidate)
    }
  }

  return [...bySemanticPost.values()]
}

function isLowSignalReply(candidate: ForYouCandidate): boolean {
  if (!candidate.replyToId) return false

  const networkProof =
    candidate.networkLikeCount + candidate.networkRepostCount * 2
  const engagementProof =
    candidate.likeCount +
    candidate.repostCount * 2 +
    candidate.replyCount +
    candidate.quoteCount

  return (
    networkProof < 2 && candidate.authorAffinityScore < 2 && engagementProof < 4
  )
}

function candidateQuality(candidate: ForYouCandidate): number {
  return (
    candidate.networkRepostCount * 4 +
    candidate.networkLikeCount * 3 +
    candidate.authorAffinityScore * 2 +
    candidate.recentEngagement30m * 2 +
    candidate.recentEngagement6h +
    Math.log1p(
      candidate.likeCount +
        candidate.repostCount * 2 +
        candidate.replyCount +
        candidate.quoteCount
    )
  )
}
