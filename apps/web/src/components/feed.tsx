import { useEffect, useMemo } from "react"
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query"
import { Button } from "@workspace/ui/components/button"
import { SkeletonPostCard } from "@workspace/ui/components/skeleton"
import { PostCard } from "./post-card"
import type { InfiniteData } from "@tanstack/react-query"
import type { FeedPage, Post } from "../lib/api"

type FeedQueryKey = ReadonlyArray<unknown>

export function Feed({
  queryKey,
  load,
  emptyMessage = "Nothing here yet.",
  prependItem,
  hideReplies = false,
  onlyReplies = false,
  onOpenThread,
  activePostId,
}: {
  queryKey: FeedQueryKey
  load: (cursor?: string) => Promise<FeedPage>
  emptyMessage?: string
  prependItem?: Post | null
  hideReplies?: boolean
  onlyReplies?: boolean
  onOpenThread?: (post: Post) => void
  activePostId?: string
}) {
  const queryClient = useQueryClient()
  const queryKeyHash = JSON.stringify(queryKey)

  const {
    data,
    error,
    isPending,
    fetchNextPage,
    isFetchingNextPage,
    hasNextPage,
  } = useInfiniteQuery<FeedPage, Error, InfiniteData<FeedPage, string | undefined>, FeedQueryKey, string | undefined>({
    queryKey,
    queryFn: ({ pageParam }) => load(pageParam),
    initialPageParam: undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  })

  useEffect(() => {
    if (!prependItem) return
    queryClient.setQueryData<InfiniteData<FeedPage, string | undefined>>(
      queryKey,
      (current) => {
        if (!current || current.pages.length === 0) return current
        const exists = current.pages.some((page) =>
          page.posts.some((p) => p.id === prependItem.id),
        )
        if (exists) return current
        const [first, ...rest] = current.pages
        return {
          ...current,
          pages: [{ ...first, posts: [prependItem, ...first.posts] }, ...rest],
        }
      },
    )
    // queryKeyHash captures the key identity; queryKey ref may change each render.
  }, [prependItem, queryClient, queryKeyHash])

  const posts = useMemo(() => {
    const all = data?.pages.flatMap((p) => p.posts) ?? []
    if (hideReplies) return all.filter((p) => !p.replyToId)
    if (onlyReplies) return all.filter((p) => p.replyToId)
    return all
  }, [data, hideReplies, onlyReplies])

  function replace(next: Post) {
    queryClient.setQueryData<InfiniteData<FeedPage, string | undefined>>(
      queryKey,
      (current) => {
        if (!current) return current
        return {
          ...current,
          pages: current.pages.map((page) => ({
            ...page,
            posts: page.posts.map((p) => (p.id === next.id ? next : p)),
          })),
        }
      },
    )
  }

  function remove(id: string) {
    queryClient.setQueryData<InfiniteData<FeedPage, string | undefined>>(
      queryKey,
      (current) => {
        if (!current) return current
        return {
          ...current,
          pages: current.pages.map((page) => ({
            ...page,
            posts: page.posts.filter((p) => p.id !== id),
          })),
        }
      },
    )
  }

  if (isPending)
    return (
      <div>
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonPostCard key={i} />
        ))}
      </div>
    )
  if (error)
    return (
      <div className="px-4 py-6 text-sm text-destructive">
        {error.message}
      </div>
    )
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
          onOpenThread={onOpenThread}
          active={
            activePostId === post.id || activePostId === post.repostOf?.id
          }
        />
      ))}
      {hasNextPage && (
        <div className="flex justify-center py-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage ? "loading…" : "load more"}
          </Button>
        </div>
      )}
    </div>
  )
}
