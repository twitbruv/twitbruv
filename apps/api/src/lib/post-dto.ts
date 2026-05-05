import { schema } from "@workspace/db"
import type { MediaEnv } from "@workspace/media/env"
import { assetUrl, publicUrl } from "@workspace/media/s3"
import type { UnfurlCard } from "./unfurl-cards.ts"
import type { PollDto } from "./polls.ts"

type PostRow = typeof schema.posts.$inferSelect
type UserRow = typeof schema.users.$inferSelect
type MediaRow = typeof schema.media.$inferSelect

export interface ViewerFlags {
  liked: boolean
  bookmarked: boolean
  reposted: boolean
}

export interface MediaVariantDto {
  kind: string
  url: string
  width: number
  height: number
}

export interface MediaDto {
  id: string
  kind: "image" | "video" | "gif"
  mimeType?: string | null
  width: number | null
  height: number | null
  blurhash: string | null
  altText: string | null
  processingState: "pending" | "processing" | "ready" | "failed" | "flagged"
  variants: Array<MediaVariantDto>
}

export interface PostDto {
  id: string
  text: string
  createdAt: string
  editedAt: string | null
  visibility: "public" | "followers" | "unlisted"
  /** Conversation root post id; null for top-level posts. */
  rootId: string | null
  /** Depth from the conversation root (root = 0, immediate reply = 1). */
  conversationDepth: number
  replyToId: string | null
  quoteOfId: string | null
  repostOfId: string | null
  sensitive: boolean
  contentWarning: string | null
  replyRestriction: "anyone" | "following" | "mentioned"
  /** Set when the conversation root author hid this reply. The thread renderer
   *  collapses these by default behind a "Show hidden replies" affordance. */
  hidden?: boolean
  author: {
    id: string
    handle: string | null
    displayName: string | null
    avatarUrl: string | null
    isVerified: boolean
    isBot: boolean
    isContributor: boolean
    role: "user" | "admin" | "owner"
  }
  counts: {
    likes: number
    reposts: number
    replies: number
    quotes: number
    bookmarks: number
  }
  media?: Array<MediaDto>
  cards?: Array<UnfurlCard>
  viewer?: ViewerFlags
  /** Populated on reposts (rows where repostOfId is set). The UI renders this instead of the
   *  empty-text repost row, with a "reposted by" banner above. */
  repostOf?: PostDto
  /** Populated on quotes (rows where quoteOfId is set) — the embedded post rendered under the
   *  quoter's commentary. Not recursive: the embed's own quoteOf/repostOf stay undefined. */
  quoteOf?: PostDto
  /** Populated on replies (rows where replyToId is set) — the parent post the row is replying
   *  to, rendered as a small embed above the reply so feed readers have conversation context.
   *  Attached by attachReplyParents() after the main DTOs are built; not recursive. */
  replyParent?: PostDto
  /** Set when this row should render with a "Pinned" banner (profile feed first item). */
  pinned?: boolean
  /** Attached poll, if any. Renders below the post text. */
  poll?: PollDto
  /** Home/public feed only: when set, render root + leaf with a collapsed gap label. */
  chainPreview?: { root: PostDto; omittedCount: number }
  /** For replies: the handles of users in the reply chain (from root to immediate parent).
   *  Used to show "Replying to @user1, @user2, ..." in notifications. */
  replyChainHandles?: string[]
}

export function toMediaDto(m: MediaRow, env: MediaEnv): MediaDto {
  const variants: Array<MediaVariantDto> = Array.isArray(m.variants)
    ? (
        m.variants as Array<{
          kind: string
          key: string
          width: number
          height: number
        }>
      ).map((v) => ({
        kind: v.kind,
        url: publicUrl(env, v.key),
        width: v.width,
        height: v.height,
      }))
    : []
  return {
    id: m.id,
    kind: m.kind,
    mimeType: m.mimeType ?? null,
    width: m.width,
    height: m.height,
    blurhash: m.blurhash,
    altText: m.altText,
    processingState: m.processingState,
    variants,
  }
}

export function toPostDto(
  post: PostRow,
  author: UserRow,
  viewer?: ViewerFlags,
  media?: Array<MediaRow>,
  env?: MediaEnv,
  cards?: Array<UnfurlCard>,
  repostOf?: PostDto,
  quoteOf?: PostDto,
  poll?: PollDto
): PostDto {
  return {
    id: post.id,
    text: post.text,
    createdAt: post.createdAt.toISOString(),
    editedAt: post.editedAt?.toISOString() ?? null,
    visibility: post.visibility,
    rootId: post.rootId,
    conversationDepth: post.conversationDepth,
    replyToId: post.replyToId,
    quoteOfId: post.quoteOfId,
    repostOfId: post.repostOfId,
    sensitive: post.sensitive,
    contentWarning: post.contentWarning,
    replyRestriction: post.replyRestriction,
    ...(post.hiddenAt ? { hidden: true } : {}),
    author: {
      id: author.id,
      handle: author.handle,
      displayName: author.displayName,
      avatarUrl: env ? assetUrl(env, author.avatarUrl) : author.avatarUrl,
      isVerified: author.isVerified,
      isBot: author.isBot,
      isContributor: author.isContributor,
      role: author.role,
    },
    counts: {
      likes: post.likeCount,
      reposts: post.repostCount,
      replies: post.replyCount,
      quotes: post.quoteCount,
      bookmarks: post.bookmarkCount,
    },
    ...(viewer ? { viewer } : {}),
    ...(media && env ? { media: media.map((m) => toMediaDto(m, env)) } : {}),
    ...(repostOf ? { repostOf } : {}),
    ...(quoteOf ? { quoteOf } : {}),
    ...(poll ? { poll } : {}),
    ...(cards && cards.length > 0 ? { cards } : {}),
  }
}
