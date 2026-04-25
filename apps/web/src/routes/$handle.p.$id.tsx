import { Link, createFileRoute } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { ApiError,   api } from "../lib/api"
import { PostCard } from "../components/post-card"
import { Compose } from "../components/compose"
import type {Post, Thread} from "../lib/api";

export const Route = createFileRoute("/$handle/p/$id")({ component: ThreadView })

function ThreadView() {
  const { handle, id } = Route.useParams()
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
            replies: t.replies.map((p) => (p.id === next.id ? next : p)),
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
              ? { ...t.post, counts: { ...t.post.counts, replies: t.post.counts.replies + 1 } }
              : t.post,
            replies: [...t.replies, post],
          }
        : t,
    )
  }

  if (error) {
    return (
      <main className="px-4 py-16 text-center">
        <p className="text-sm text-muted-foreground">post not found</p>
        <Link
          to="/$handle"
          params={{ handle }}
          className="mt-3 inline-block text-xs text-primary hover:underline"
        >
          back to @{handle}
        </Link>
      </main>
    )
  }

  if (!thread) {
    return (
      <main className="px-4 py-16">
        <p className="text-sm text-muted-foreground">loading…</p>
      </main>
    )
  }

  return (
    <main className="">
      {/* Ancestors - context posts leading to the main post */}
      {thread.ancestors.length > 0 && (
        <div className="opacity-60">
          {thread.ancestors.map((p) => (
            <PostCard key={p.id} post={p} onChange={replace} />
          ))}
        </div>
      )}

      {/* Main post */}
      {thread.post && (
        <div className="bg-muted/10">
          <PostCard post={thread.post} onChange={replace} />
        </div>
      )}

      {/* Replies section */}
      {thread.replies.length > 0 && (
        <div>
          <div className="px-4 py-2 text-xs font-medium text-muted-foreground border-y border-border">
            {thread.replies.length} {thread.replies.length === 1 ? 'reply' : 'replies'}
          </div>
          {thread.replies.map((p) => (
            <PostCard key={p.id} post={p} onChange={replace} />
          ))}
        </div>
      )}

      {/* Reply composer - sticky at bottom */}
      <div className="sticky bottom-0 border-t border-border bg-background">
        <Compose onCreated={onReply} replyToId={id} placeholder={`Reply to @${handle}`} />
      </div>
    </main>
  )
}
