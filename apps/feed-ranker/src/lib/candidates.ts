import type { ForYouNetworkClass, ForYouSourceBucket } from "@workspace/types"
import type { QueryContext } from "./query-context.ts"
import type { RankerRuntime } from "./runtime.ts"

export interface ForYouCandidate {
  postId: string
  authorId: string | null
  originalPostId: string | null
  sourceBucket: ForYouSourceBucket
  networkClass: ForYouNetworkClass
  createdAt: Date | null
}

export async function loadCandidates(
  _context: QueryContext,
  _runtime: RankerRuntime
): Promise<ForYouCandidate[]> {
  return []
}
