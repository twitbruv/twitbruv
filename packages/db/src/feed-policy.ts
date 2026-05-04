import { and, eq, isNull, sql, type SQL } from "drizzle-orm"
import { blocks, mutes, posts } from "./schema/index.ts"

type FeedPolicyColumn = SQL | typeof posts.authorId

export function isVisibleFeedPost(): SQL {
  return isNull(posts.deletedAt)
}

export function isPublicFeedPost(): SQL {
  return and(isVisibleFeedPost(), eq(posts.visibility, "public"))!
}

export function excludeViewerBlocks(
  viewerId: string,
  authorId: FeedPolicyColumn = posts.authorId
): SQL {
  return sql`NOT EXISTS (
    SELECT 1
    FROM ${blocks} b
    WHERE
      (b.blocker_id = ${viewerId} AND b.blocked_id = ${authorId})
      OR (b.blocker_id = ${authorId} AND b.blocked_id = ${viewerId})
  )`
}

export function excludeViewerFeedMutes(
  viewerId: string,
  authorId: FeedPolicyColumn = posts.authorId
): SQL {
  return sql`NOT EXISTS (
    SELECT 1
    FROM ${mutes} m
    WHERE
      m.muter_id = ${viewerId}
      AND m.muted_id = ${authorId}
      AND (m.scope = 'feed' OR m.scope = 'both')
  )`
}

export function excludeViewerOwnPosts(
  viewerId: string,
  authorId: FeedPolicyColumn = posts.authorId
): SQL {
  return sql`${authorId} <> ${viewerId}`
}

export function excludeViewerSocialFilters(
  viewerId: string,
  authorId: FeedPolicyColumn = posts.authorId
): SQL {
  return and(
    excludeViewerBlocks(viewerId, authorId),
    excludeViewerFeedMutes(viewerId, authorId)
  )!
}

export function eligiblePublicFeedPost(
  viewerId: string,
  authorId: FeedPolicyColumn = posts.authorId
): SQL {
  return and(
    isPublicFeedPost(),
    excludeViewerSocialFilters(viewerId, authorId),
    excludeViewerOwnPosts(viewerId, authorId)
  )!
}
