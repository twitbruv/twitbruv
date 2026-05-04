export const FOR_YOU_ALGO_VERSION = "for_you_v1" as const
export type ForYouAlgoVersion = typeof FOR_YOU_ALGO_VERSION

export const FOR_YOU_EXPERIMENT_NAME = "for_you_v1" as const

export const FOR_YOU_VARIANTS = ["for_you_v1_a", "for_you_v1_b"] as const
export type ForYouVariant = (typeof FOR_YOU_VARIANTS)[number]

export const FOR_YOU_NETWORK_CLASSES = [
  "following",
  "adjacent",
  "discovery",
] as const
export type ForYouNetworkClass = (typeof FOR_YOU_NETWORK_CLASSES)[number]

export const FOR_YOU_SOURCE_BUCKETS = ["network", "affinity", "public"] as const
export type ForYouSourceBucket = (typeof FOR_YOU_SOURCE_BUCKETS)[number]

export const FOR_YOU_SURFACE = "for_you" as const
export type ForYouSurface = typeof FOR_YOU_SURFACE

export interface ForYouRankRequest {
  userId: string
  limit: number
  cursor?: string | null
  algoVersion: ForYouAlgoVersion
  variant: ForYouVariant
}

export interface ForYouRankResponse {
  postIds: string[]
  nextCursor: string | null
  algoVersion: ForYouAlgoVersion
  variant: ForYouVariant
}

export interface ForYouSessionCursorPayload {
  sessionId: string
  offset: number
}

export interface ForYouSessionExpiredResponse {
  error: "session_expired"
  restartRequired: true
}

export type ForYouRankerResponse =
  | ForYouRankResponse
  | ForYouSessionExpiredResponse

export interface ForYouFeedContext {
  surface: ForYouSurface
  algoVersion: ForYouAlgoVersion
  variant: ForYouVariant
  position?: number
}

export function bucketForYouVariant(userId: string): ForYouVariant {
  const bucket = hashToBucket(
    `${FOR_YOU_EXPERIMENT_NAME}:${userId}`,
    FOR_YOU_VARIANTS.length
  )
  return FOR_YOU_VARIANTS[bucket]!
}

export function hashToBucket(input: string, bucketCount: number): number {
  if (bucketCount <= 0 || bucketCount % 1 !== 0) {
    throw new Error("bucketCount must be a positive integer")
  }

  return fnv1a32(input) % bucketCount
}

function fnv1a32(input: string): number {
  let hash = 0x811c9dc5

  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24)
  }

  return hash >>> 0
}
