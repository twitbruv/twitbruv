import type { ForYouRankRequest } from "@workspace/types"

export interface QueryContext {
  request: ForYouRankRequest
  userId: string
  limit: number
  cursor: string | null
  servedPostIds: string[]
  requestedAt: Date
}

export async function hydrateQueryContext(request: ForYouRankRequest): Promise<QueryContext> {
  return {
    request,
    userId: request.userId,
    limit: request.limit,
    cursor: request.cursor ?? null,
    servedPostIds: [],
    requestedAt: new Date(),
  }
}
