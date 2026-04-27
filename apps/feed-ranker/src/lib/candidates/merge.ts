import type { ForYouSourceBucket } from "@workspace/types"
import type { ForYouCandidate } from "./types.ts"

export function mergeCandidateSignals(
  candidates: Array<ForYouCandidate>
): Array<ForYouCandidate> {
  const byId = new Map<string, ForYouCandidate>()
  const sourcePriority: Record<ForYouSourceBucket, number> = {
    network: 3,
    affinity: 2,
    public: 1,
  }

  for (const candidate of candidates) {
    const existing = byId.get(candidate.postId)
    if (!existing) {
      byId.set(candidate.postId, candidate)
      continue
    }

    existing.networkLikeCount = Math.max(
      existing.networkLikeCount,
      candidate.networkLikeCount
    )
    existing.networkRepostCount = Math.max(
      existing.networkRepostCount,
      candidate.networkRepostCount
    )
    existing.authorAffinityScore = Math.max(
      existing.authorAffinityScore,
      candidate.authorAffinityScore
    )
    if (candidate.activityAt > existing.activityAt) {
      existing.activityAt = candidate.activityAt
    }
    if (
      sourcePriority[candidate.sourceBucket] >
      sourcePriority[existing.sourceBucket]
    ) {
      existing.sourceBucket = candidate.sourceBucket
      existing.networkClass = candidate.networkClass
    }
  }

  return [...byId.values()].slice(0, 250)
}
