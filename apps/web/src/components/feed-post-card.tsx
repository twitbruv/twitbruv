import { useNavigate } from "@tanstack/react-router"
import { useCallback } from "react"
import { PostCard } from "@workspace/ui/components/post-card"
import {
  useTogglePostBookmark,
  useTogglePostLike,
  useTogglePostRepost,
} from "../lib/mutations/posts"
import { api } from "../lib/api"
import { pickPrimaryMediaUrl } from "../lib/media"
import { useCompose } from "./compose-provider"
import { RichText } from "./rich-text"
import { ArticleCardBlock } from "./post-card"
import { GithubCardBlock } from "./github-card"
import { LinkCardBlock } from "./link-card"
import { useLightbox } from "./lightbox-provider"
import { LightboxSidebar } from "./lightbox-sidebar"
import { XStatusCardBlock } from "./x-status-card"
import { YoutubeCardBlock } from "./youtube-card"
import type { Post, PostMedia, UnfurlCard } from "../lib/api"
import type {
  AuthorProfile,
  PostQuoteOf,
  PostMedia as UIPostMedia,
} from "@workspace/ui/components/post-card"

function unfurlCardKey(card: UnfurlCard, i: number): string {
  const base =
    card.provider === "article"
      ? `article-${card.id}`
      : `${card.kind}-${card.url}`
  return `${base}-${i}`
}

function UnfurlBelow({ card, post }: { card: UnfurlCard; post: Post }) {
  if (card.provider === "article") {
    return <ArticleCardBlock card={card} />
  }
  if (card.provider === "github") {
    return <GithubCardBlock card={card} />
  }
  if (card.provider === "youtube") {
    return <YoutubeCardBlock card={card} post={post} />
  }
  if (card.provider === "x") {
    return <XStatusCardBlock card={card} />
  }
  return <LinkCardBlock card={card} />
}

function relativeTime(iso: string): string {
  const d = new Date(iso).getTime()
  const diff = Date.now() - d
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const dd = Math.floor(h / 24)
  if (dd < 7) return `${dd}d`
  return new Date(iso).toLocaleDateString()
}

function mapMedia(media: Array<PostMedia>): Array<UIPostMedia> {
  return media
    .filter((m) => m.processingState === "ready" && m.variants.length > 0)
    .map((m) => {
      if (m.kind === "video") {
        const first = m.variants[0]
        const variant =
          m.variants.find((v) => v.kind === "medium") ??
          m.variants.find((v) => v.kind === "large") ??
          m.variants.find((v) => v.kind === "thumb") ??
          first
        const thumb = m.variants.find((v) => v.kind === "thumb") ?? variant
        return {
          type: "video" as const,
          url: variant.url,
          thumbnailUrl: thumb.url,
        }
      }
      const url = pickPrimaryMediaUrl(m, "medium") ?? ""
      return {
        type: "image" as const,
        url,
        alt: m.altText ?? undefined,
      }
    })
}

interface FeedPostCardProps {
  post: Post
  threadLine?: "top" | "bottom" | "both"
  disableHover?: boolean
  truncateText?: boolean
}

export function FeedPostCard({
  post: outerPost,
  threadLine,
  disableHover = false,
  truncateText = true,
}: FeedPostCardProps) {
  const navigate = useNavigate()
  const lightbox = useLightbox()
  const compose = useCompose()

  const isRepost = Boolean(outerPost.repostOf)
  const post = outerPost.repostOf ?? outerPost
  const authorHandle = post.author.handle ?? "unknown"

  const likeMutation = useTogglePostLike(post)
  const repostMutation = useTogglePostRepost(post)
  const bookmarkMutation = useTogglePostBookmark(post)

  const resolveBruvLikeBurstSrc = useCallback(
    () => (Math.random() < 0.1 ? "/bruv.png" : undefined),
    []
  )

  const quoteOf: PostQuoteOf | undefined = post.quoteOf
    ? (() => {
        const q = post.quoteOf
        const qHandle = q.author.handle ?? "unknown"
        const thumb = q.media?.find(
          (m) => m.processingState === "ready" && m.variants.length > 0
        )
        const thumbVariant =
          thumb?.variants.find((v) => v.kind === "thumb") ??
          thumb?.variants.find((v) => v.kind === "medium") ??
          thumb?.variants[0]
        return {
          author: {
            handle: q.author.handle,
            displayName: q.author.displayName,
            avatarUrl: q.author.avatarUrl,
          },
          text: q.text,
          time: relativeTime(q.createdAt),
          thumbnailUrl: thumbVariant?.url,
          onClick: () =>
            navigate({
              to: "/$handle/p/$id",
              params: { handle: qHandle, id: q.id },
            }),
        }
      })()
    : undefined

  return (
    <PostCard
      author={{
        handle: authorHandle,
        displayName: post.author.displayName ?? authorHandle,
        avatarUrl: post.author.avatarUrl,
      }}
      text={post.text}
      time={relativeTime(post.createdAt)}
      likes={post.counts.likes}
      replies={post.counts.replies}
      reposts={post.counts.reposts}
      liked={post.viewer?.liked ?? false}
      reposted={post.viewer?.reposted ?? false}
      bookmarked={post.viewer?.bookmarked ?? false}
      media={post.media ? mapMedia(post.media) : undefined}
      onMediaClick={(index) => {
        const images = (post.media ?? [])
          .filter(
            (m) =>
              (m.kind === "image" || m.kind === "gif") &&
              m.processingState === "ready" &&
              m.variants.length > 0
          )
          .map((m) => ({
            url:
              pickPrimaryMediaUrl(m, "large") ??
              pickPrimaryMediaUrl(m, "medium") ??
              "",
            alt: m.altText ?? undefined,
          }))
          .filter((img) => img.url)
        if (images.length > 0) {
          lightbox.open(images, index, <LightboxSidebar post={outerPost} />)
        }
      }}
      repostedBy={
        isRepost
          ? (outerPost.author.displayName ??
            outerPost.author.handle ??
            undefined)
          : undefined
      }
      quoteOf={quoteOf}
      truncateText={truncateText}
      disableHover={disableHover}
      threadLine={threadLine}
      belowText={
        <>
          {post.cards?.map((card, i) => (
            <UnfurlBelow
              key={unfurlCardKey(card, i)}
              card={card}
              post={outerPost}
            />
          ))}
        </>
      }
      onClick={() =>
        navigate({
          to: "/$handle/p/$id",
          params: { handle: authorHandle, id: post.id },
        })
      }
      onLike={() => likeMutation.mutate()}
      onRepost={() => repostMutation.mutate()}
      onBookmark={() => bookmarkMutation.mutate()}
      onQuote={() => compose.open({ quoteOfId: post.id, quoted: post })}
      onReply={() =>
        navigate({
          to: "/$handle/p/$id",
          params: { handle: authorHandle, id: post.id },
        })
      }
      onAuthorClick={() =>
        navigate({
          to: "/$handle",
          params: { handle: authorHandle },
        })
      }
      onFetchAuthorProfile={async (): Promise<AuthorProfile> => {
        const { user } = await api.user(authorHandle)
        return {
          bio: user.bio,
          followers: user.counts.followers,
          following: user.counts.following,
          isFollowing: user.viewer?.following,
          onFollowToggle: user.viewer
            ? async (follow: boolean) => {
                if (follow) {
                  await api.follow(authorHandle)
                } else {
                  await api.unfollow(authorHandle)
                }
              }
            : undefined,
        }
      }}
      resolveBruvLikeBurstSrc={resolveBruvLikeBurstSrc}
      renderPostText={(t) => <RichText text={t} stopLinkPropagation />}
    />
  )
}
