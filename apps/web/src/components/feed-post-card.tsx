import { useNavigate } from "@tanstack/react-router"
import { useMutation } from "@tanstack/react-query"
import {
	PostCard,
	type PostMedia as UIPostMedia,
	type PostQuoteOf,
} from "@workspace/ui/components/post-card"
import { api } from "../lib/api"
import { useLightbox } from "./lightbox-provider"
import { useCompose } from "./compose-provider"
import { LightboxSidebar } from "./lightbox-sidebar"
import type { Post, PostMedia } from "../lib/api"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function pickVariant(media: PostMedia) {
	return (
		media.variants.find((v) => v.kind === "medium") ??
		media.variants.find((v) => v.kind === "large") ??
		media.variants.find((v) => v.kind === "thumb") ??
		media.variants[0]
	)
}

function mapMedia(media: PostMedia[]): UIPostMedia[] {
	return media
		.filter((m) => m.processingState === "ready" && m.variants.length > 0)
		.map((m) => {
			const variant = pickVariant(m)
			if (!variant) return null
			if (m.kind === "video" || m.kind === "gif") {
				const thumb =
					m.variants.find((v) => v.kind === "thumb") ?? variant
				return {
					type: "video" as const,
					url: variant.url,
					thumbnailUrl: thumb.url,
				}
			}
			return {
				type: "image" as const,
				url: variant.url,
				alt: m.altText ?? undefined,
			}
		})
		.filter((m): m is UIPostMedia => m !== null)
}

// ---------------------------------------------------------------------------
// FeedPostCard
// ---------------------------------------------------------------------------

interface FeedPostCardProps {
	post: Post
	/** Called with updated post after optimistic mutation */
	onChange?: (post: Post) => void
	/** Called when the post is removed */
	onRemove?: (id: string) => void
	/** Thread line for connected posts */
	threadLine?: "top" | "bottom" | "both"
	/** Disable hover (for detail views) */
	disableHover?: boolean
	/** Truncate text in feed */
	truncateText?: boolean
}

export function FeedPostCard({
	post: outerPost,
	onChange,
	onRemove: _onRemove,
	threadLine,
	disableHover = false,
	truncateText = true,
}: FeedPostCardProps) {
	const navigate = useNavigate()
	const lightbox = useLightbox()
	const compose = useCompose()

	// Unwrap reposts
	const isRepost = Boolean(outerPost.repostOf)
	const post = outerPost.repostOf ?? outerPost
	const authorHandle = post.author.handle ?? "unknown"

	// Mutations
	const likeMutation = useMutation({
		mutationFn: () =>
			post.viewer?.liked ? api.unlike(post.id) : api.like(post.id),
		onMutate: () => {
			if (!onChange) return
			const wasLiked = post.viewer?.liked ?? false
			onChange({
				...outerPost,
				...(isRepost && outerPost.repostOf
					? {
							repostOf: {
								...post,
								viewer: { ...post.viewer!, liked: !wasLiked, bookmarked: post.viewer?.bookmarked ?? false, reposted: post.viewer?.reposted ?? false },
								counts: { ...post.counts, likes: post.counts.likes + (wasLiked ? -1 : 1) },
							},
						}
					: {
							viewer: { ...post.viewer!, liked: !wasLiked, bookmarked: post.viewer?.bookmarked ?? false, reposted: post.viewer?.reposted ?? false },
							counts: { ...post.counts, likes: post.counts.likes + (wasLiked ? -1 : 1) },
						}),
			})
		},
	})

	const repostMutation = useMutation({
		mutationFn: () =>
			post.viewer?.reposted ? api.unrepost(post.id) : api.repost(post.id),
		onMutate: () => {
			if (!onChange) return
			const wasReposted = post.viewer?.reposted ?? false
			onChange({
				...outerPost,
				...(isRepost && outerPost.repostOf
					? {
							repostOf: {
								...post,
								viewer: { ...post.viewer!, reposted: !wasReposted, liked: post.viewer?.liked ?? false, bookmarked: post.viewer?.bookmarked ?? false },
								counts: { ...post.counts, reposts: post.counts.reposts + (wasReposted ? -1 : 1) },
							},
						}
					: {
							viewer: { ...post.viewer!, reposted: !wasReposted, liked: post.viewer?.liked ?? false, bookmarked: post.viewer?.bookmarked ?? false },
							counts: { ...post.counts, reposts: post.counts.reposts + (wasReposted ? -1 : 1) },
						}),
			})
		},
	})

	const bookmarkMutation = useMutation({
		mutationFn: () =>
			post.viewer?.bookmarked
				? api.unbookmark(post.id)
				: api.bookmark(post.id),
		onMutate: () => {
			if (!onChange) return
			const wasBookmarked = post.viewer?.bookmarked ?? false
			onChange({
				...outerPost,
				...(isRepost && outerPost.repostOf
					? {
							repostOf: {
								...post,
								viewer: { ...post.viewer!, bookmarked: !wasBookmarked, liked: post.viewer?.liked ?? false, reposted: post.viewer?.reposted ?? false },
								counts: { ...post.counts, bookmarks: post.counts.bookmarks + (wasBookmarked ? -1 : 1) },
							},
						}
					: {
							viewer: { ...post.viewer!, bookmarked: !wasBookmarked, liked: post.viewer?.liked ?? false, reposted: post.viewer?.reposted ?? false },
							counts: { ...post.counts, bookmarks: post.counts.bookmarks + (wasBookmarked ? -1 : 1) },
						}),
			})
		},
	})

	// Build quote embed data
	const quoteOf: PostQuoteOf | undefined = post.quoteOf
		? (() => {
				const q = post.quoteOf
				const qHandle = q.author.handle ?? "unknown"
				const thumb = q.media?.find(
					(m) => m.processingState === "ready" && m.variants.length > 0,
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
					.filter((m) => m.kind === "image" && m.processingState === "ready" && m.variants.length > 0)
					.map((m) => {
						const variant = pickVariant(m)
						return { url: variant?.url ?? "", alt: m.altText ?? undefined }
					})
					.filter((img) => img.url)
				if (images.length > 0) {
					lightbox.open(
						images,
						index,
						<LightboxSidebar post={outerPost} />,
					)
				}
			}}
			repostedBy={
				isRepost
					? outerPost.author.displayName ?? outerPost.author.handle ?? undefined
					: undefined
			}
			quoteOf={quoteOf}
			truncateText={truncateText}
			disableHover={disableHover}
			threadLine={threadLine}
			onClick={() =>
				navigate({
					to: "/$handle/p/$id",
					params: { handle: authorHandle, id: post.id },
				})
			}
			onLike={() => likeMutation.mutate()}
			onRepost={() => repostMutation.mutate()}
			onBookmark={() => bookmarkMutation.mutate()}
			onQuote={() =>
				compose.open({ quoteOfId: post.id, quoted: post })
			}
			onReply={() =>
				navigate({
					to: "/$handle/p/$id",
					params: { handle: authorHandle, id: post.id },
				})
			}
		/>
	)
}
