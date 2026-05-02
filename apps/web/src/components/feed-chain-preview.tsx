import { useNavigate } from "@tanstack/react-router"
import { FeedPostCard } from "./feed-post-card"
import type { Post } from "../lib/api"

function leafPostId(post: Post): string {
  const inner = post.repostOf ?? post
  return inner.id
}

export function FeedChainPreview({ post }: { post: Post }) {
  const navigate = useNavigate()
  const preview = post.chainPreview
  if (!preview) return <FeedPostCard post={post} />

  const { root, omittedCount } = preview
  const leafId = leafPostId(post)
  const openLeaf = () => {
    const inner = post.repostOf ?? post
    const handle = inner.author.handle ?? "unknown"
    navigate({ to: "/$handle/p/$id", params: { handle, id: leafId } })
  }

  const replyWord = omittedCount === 1 ? "reply" : "replies"

  return (
    <div className="flex flex-col">
      <FeedPostCard post={root} threadLine="bottom" />
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          openLeaf()
        }}
        className="text-muted-foreground flex items-center gap-3 py-1.5 pr-4 pl-[68px] text-left text-xs hover:text-primary"
      >
        <span
          className="h-8 w-px shrink-0 bg-[var(--border-color-neutral)]"
          aria-hidden
        />
        <span className="underline-offset-2 hover:underline">
          {omittedCount} more {replyWord}
        </span>
      </button>
      <FeedPostCard post={post} threadLine="top" />
    </div>
  )
}
