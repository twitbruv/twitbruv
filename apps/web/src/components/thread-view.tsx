import { Link, useNavigate } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { IconArrowsMaximize, IconX } from "@tabler/icons-react"
import { Button } from "@workspace/ui/components/button"
import { ApiError, api } from "../lib/api"
import { homeThreadFromFeedSearch } from "../lib/home-from-feed"
import { Compose } from "./compose"
import { PostCard } from "./post-card"
import type { Post, Thread } from "../lib/api"

export function ThreadViewContent({
  handle,
  id,
  mode = "page",
  onClose,
  returnToHome,
}: {
  handle: string
  id: string
  mode?: "page" | "panel"
  onClose?: () => void
  returnToHome?: {
    postId: string
    postHandle: string
  }
}) {
  const navigate = useNavigate()
  const [thread, setThread] = useState<Thread | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setThread(null)
    setError(null)
    api
      .thread(id)
      .then(setThread)
      .catch((e) => setError(e instanceof ApiError ? e.message : "not found"))
  }, [id])

  function replace(next: Post) {
    setThread((t) =>
      t
        ? {
            ancestors: t.ancestors.map((p) => (p.id === next.id ? next : p)),
            post: t.post && t.post.id === next.id ? next : t.post,
            replies: t.replies.map((p) =>
              p.id === next.id ? { ...p, ...next } : p,
            ),
          }
        : t,
    )
  }

  function onReply(post: Post) {
    setThread((t) =>
      t
        ? {
            ...t,
            post: t.post
              ? {
                  ...t.post,
                  counts: {
                    ...t.post.counts,
                    replies: t.post.counts.replies + 1,
                  },
                }
              : t.post,
            replies: [...t.replies, { ...post, descendantReplyCount: 0 }],
          }
        : t
    )
  }

  const isPanel = mode === "panel"

  function openFullView() {
    navigate({
      to: "/$handle/p/$id",
      params: { handle, id },
      search: returnToHome
        ? homeThreadFromFeedSearch(returnToHome.postId, returnToHome.postHandle)
        : {},
    })
  }

  return (
    <div className={isPanel ? "flex h-full flex-col bg-background" : ""}>
      {isPanel && (
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/95 px-3 py-2 backdrop-blur-sm">
          <p className="text-sm font-semibold">Post</p>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              title="Open full view"
              onClick={openFullView}
            >
              <IconArrowsMaximize className="size-4" />
            </Button>
            {onClose && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onClose}
                title="Close"
              >
                <IconX className="size-4" />
              </Button>
            )}
          </div>
        </div>
      )}

      <div className={isPanel ? "min-h-0 flex-1 overflow-y-auto" : ""}>
        {error ? (
          <div className="px-4 py-16 text-center">
            <p className="text-sm text-muted-foreground">post not found</p>
            <Link
              to="/$handle"
              params={{ handle }}
              className="mt-3 inline-block text-xs text-primary hover:underline"
            >
              back to @{handle}
            </Link>
          </div>
        ) : !thread ? (
          <div className="px-4 py-16">
            <p className="text-sm text-muted-foreground">loading…</p>
          </div>
        ) : (
          <>
            {thread.ancestors.length > 0 && (
              <div className="border-b border-border/50">
                {thread.ancestors.map((p) => (
                  <PostCard
                    key={p.id}
                    post={p}
                    onChange={replace}
                    disableThreadNavigation={isPanel}
                  />
                ))}
              </div>
            )}
            {thread.post && (
              <div className="bg-muted/20">
                <PostCard
                  post={thread.post}
                  onChange={replace}
                  disableThreadNavigation={isPanel}
                />
              </div>
            )}
            <Compose
              onCreated={onReply}
              replyToId={id}
              placeholder={`Reply to @${handle}`}
            />
            {thread.replies.length > 0 ? (
              <div>
                {thread.replies.map((p) => (
                  <PostCard key={p.id} post={p} onChange={replace} />
                ))}
              </div>
            ) : (
              <div className="border-t border-border px-4 py-6 text-sm text-muted-foreground">
                No replies yet.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
