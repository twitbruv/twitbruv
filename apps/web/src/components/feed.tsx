import { useEffect, useMemo } from "react"
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query"
import { Button } from "@workspace/ui/components/button"
import { SkeletonPostCard } from "@workspace/ui/components/skeleton"
import { PostCard } from "./post-card"
import type { InfiniteData } from "@tanstack/react-query"
import type { FeedPage, Post } from "../lib/api"

type FeedQueryKey = ReadonlyArray<unknown>

interface FeedLoaderPage {
  posts: Array<Post>
  nextCursor: string | null
}

export function Feed({
  queryKey,
  load,
  emptyMessage = "Nothing here yet.",
  prependItem,
  hideReplies = false,
  onlyReplies = false,
  onOpenThread,
  activePostId,
  renderActivityBanner,
}: {
  queryKey: FeedQueryKey
  load: (cursor?: string) => Promise<FeedLoaderPage | FeedPage>
  emptyMessage?: string
  prependItem?: Post | null
  hideReplies?: boolean
  onlyReplies?: boolean
  onOpenThread?: (post: Post) => void
  activePostId?: string
  /** Optional banner rendered above each post card (e.g. "Lucas liked this"
   *  on the network feed). Returning null skips the banner for that row. */
  renderActivityBanner?: (post: Post) => React.ReactNode
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
      {posts.map((post) => {
        const banner = renderActivityBanner?.(post)
        return (
          <div key={post.id}>
            {banner && (
              <div className="border-b border-border/50 px-4 pt-2">
                {banner}
              </div>
            )}
            <PostCard
              post={post}
              onChange={replace}
              onRemove={remove}
              onOpenThread={onOpenThread}
              active={
                activePostId === post.id || activePostId === post.repostOf?.id
              }
            />
          </div>
        )
      })}
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
