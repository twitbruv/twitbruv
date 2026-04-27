import { useQuery } from "@tanstack/react-query"
import { Spinner } from "@workspace/ui/components/spinner"
import { api } from "../lib/api"
import { qk } from "../lib/query-keys"
import { FeedPostCard } from "./feed-post-card"
import type { Post } from "../lib/api"

interface LightboxSidebarProps {
	post: Post
}

/**
 * Sidebar content for the lightbox — shows the post (without media)
 * and its replies fetched from the thread API.
 */
export function LightboxSidebar({ post }: LightboxSidebarProps) {
	const { data, isLoading } = useQuery({
		queryKey: qk.thread(post.id),
		queryFn: () => api.thread(post.id),
	})

	const replies = data?.replies ?? []

	return (
		<div className="flex flex-col">
			{/* Main post (no media since you're looking at it in the lightbox) */}
			<FeedPostCard
				post={post}
				disableHover
				truncateText={false}
			/>

			{/* Replies */}
			{isLoading ? (
				<div className="flex justify-center py-6">
					<Spinner size="sm" />
				</div>
			) : replies.length > 0 ? (
				replies.map((reply) => (
					<FeedPostCard
						key={reply.id}
						post={reply}
						truncateText={false}
					/>
				))
			) : (
				<div className="px-4 py-6 text-center text-sm text-tertiary">
					No replies yet
				</div>
			)}
		</div>
	)
}
