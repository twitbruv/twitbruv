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

  return (
    <div className="flex flex-col">
      <FeedPostCard post={root} threadLine="bottom" />
      {omittedCount > 0 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            openLeaf()
          }}
          className="text-muted-foreground flex items-center gap-3 px-4 py-1.5 text-left text-xs hover:text-primary"
        >
          <div className="-my-1.5 flex w-10 shrink-0 items-stretch justify-center self-stretch">
            <span
              className="w-px bg-[var(--border-color-neutral)]"
              aria-hidden
            />
          </div>
          <span className="underline-offset-2 hover:underline">
            {omittedCount} more {omittedCount === 1 ? "reply" : "replies"}
          </span>
        </button>
      )}
      <FeedPostCard post={post} threadLine="top" />
    </div>
  )
}
