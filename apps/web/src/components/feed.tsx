import { useEffect, useState } from "react"
import { Button } from "@workspace/ui/components/button"
import { SkeletonPostCard } from "@workspace/ui/components/skeleton"
import { PostCard } from "./post-card"
import type { FeedPage, Post } from "../lib/api"

export function Feed({
  load,
  emptyMessage = "Nothing here yet.",
  prependItem,
  hideReplies = false,
  onlyReplies = false,
}: {
  load: (cursor?: string) => Promise<FeedPage>
  emptyMessage?: string
  prependItem?: Post | null
  /** Filter out posts that are replies (have a replyToId) */
  hideReplies?: boolean
  /** Only show posts that are replies (have a replyToId) */
  onlyReplies?: boolean
}) {
  const [posts, setPosts] = useState<Array<Post>>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)

  // Filter function for hiding/showing replies
  const filterPosts = (posts: Array<Post>) => {
    if (hideReplies) return posts.filter((p) => !p.replyToId)
    if (onlyReplies) return posts.filter((p) => p.replyToId)
    return posts
  }

  useEffect(() => {
    let cancel = false
    setLoading(true)
    load()
      .then((page) => {
        if (cancel) return
        setPosts(filterPosts(page.posts))
        setCursor(page.nextCursor)
      })
      .catch((e) => {
        if (!cancel) setError(e instanceof Error ? e.message : "failed to load")
      })
      .finally(() => {
        if (!cancel) setLoading(false)
      })
    return () => {
      cancel = true
    }
  }, [load])

  useEffect(() => {
    if (!prependItem) return
    setPosts((prev) =>
      prev.some((p) => p.id === prependItem.id) ? prev : [prependItem, ...prev]
    )
  }, [prependItem])

  async function loadMore() {
    if (!cursor || loadingMore) return
    setLoadingMore(true)
    try {
      const page = await load(cursor)
      setPosts((prev) => [...prev, ...filterPosts(page.posts)])
      setCursor(page.nextCursor)
    } finally {
      setLoadingMore(false)
    }
  }

  function replace(next: Post) {
    setPosts((prev) => prev.map((p) => (p.id === next.id ? next : p)))
  }
  function remove(id: string) {
    setPosts((prev) => prev.filter((p) => p.id !== id))
  }

  if (loading)
    return (
      <div>
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonPostCard key={i} />
        ))}
      </div>
    )
  if (error)
    return <div className="px-4 py-6 text-sm text-destructive">{error}</div>
  if (posts.length === 0)
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    )

  return (
    <div>
      {posts.map((post) => (
        <PostCard
          key={post.id}
          post={post}
          onChange={replace}
          onRemove={remove}
        />
      ))}
      {cursor && (
        <div className="flex justify-center py-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={loadMore}
            disabled={loadingMore}
          >
            {loadingMore ? "loading…" : "load more"}
          </Button>
        </div>
      )}
    </div>
  )
}
