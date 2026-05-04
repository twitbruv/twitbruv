import type { ForYouNetworkClass, ForYouSourceBucket } from "@workspace/types"
import type { QueryContext } from "../query-context.ts"

export interface ForYouCandidate {
  postId: string
  authorId: string
  originalPostId: string | null
  sourceBucket: ForYouSourceBucket
  networkClass: ForYouNetworkClass
  createdAt: Date
  replyToId: string | null
  quoteOfId: string | null
  repostOfId: string | null
  likeCount: number
  repostCount: number
  replyCount: number
  quoteCount: number
  networkLikeCount: number
  networkRepostCount: number
  authorAffinityScore: number
  recentEngagement30m: number
  recentEngagement6h: number
  isFollowedAuthor: boolean
  activityAt: Date
}

export type CandidateRow = {
  post_id: string
  author_id: string
  original_post_id: string | null
  created_at: Date | string
  reply_to_id: string | null
  quote_of_id: string | null
  repost_of_id: string | null
  like_count: number
  repost_count: number
  reply_count: number
  quote_count: number
  network_like_count: number
  network_repost_count: number
  author_affinity_score: number
  activity_at: Date | string
}

export function rowToCandidate(
  row: CandidateRow,
  sourceBucket: ForYouSourceBucket,
  networkClass: ForYouNetworkClass,
  context: QueryContext
): ForYouCandidate {
  return {
    postId: row.post_id,
    authorId: row.author_id,
    originalPostId: row.original_post_id,
    sourceBucket,
    networkClass,
    createdAt: asDate(row.created_at),
    replyToId: row.reply_to_id,
    quoteOfId: row.quote_of_id,
    repostOfId: row.repost_of_id,
    likeCount: Number(row.like_count),
    repostCount: Number(row.repost_count),
    replyCount: Number(row.reply_count),
    quoteCount: Number(row.quote_count),
    networkLikeCount: Number(row.network_like_count),
    networkRepostCount: Number(row.network_repost_count),
    authorAffinityScore: Number(row.author_affinity_score),
    recentEngagement30m: 0,
    recentEngagement6h: 0,
    isFollowedAuthor: context.followedAuthorIds.has(row.author_id),
    activityAt: asDate(row.activity_at),
  }
}

export function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value)
}
