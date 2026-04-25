import { useEffect, useMemo, useRef, useState } from "react"
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query"
import { useVirtualizer } from "@tanstack/react-virtual"
import { SkeletonPostCard } from "@workspace/ui/components/skeleton"
import { PostCard } from "./post-card"
import type { InfiniteData } from "@tanstack/react-query"
import type { FeedPage, Post } from "../lib/api"

type FeedQueryKey = ReadonlyArray<unknown>

interface FeedLoaderPage {
  posts: Array<Post>
  nextCursor: string | null
}

// Walk up the DOM to find the nearest ancestor that scrolls. Falls back to
// document.scrollingElement for the page-level scroll case.
function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node: HTMLElement | null = el?.parentElement ?? null
  while (node) {
    const style = getComputedStyle(node)
    if (/(auto|scroll|overlay)/.test(style.overflowY)) return node
    node = node.parentElement
  }
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement
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
  } = useInfiniteQuery<
    FeedPage,
    Error,
    InfiniteData<FeedPage, string | undefined>,
    FeedQueryKey,
    string | undefined
  >({
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
          page.posts.some((p) => p.id === prependItem.id)
        )
        if (exists) return current
        const [first, ...rest] = current.pages
        return {
          ...current,
          pages: [{ ...first, posts: [prependItem, ...first.posts] }, ...rest],
        }
      }
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
      }
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
      }
    )
  }

  const wrapperRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const [scrollEl, setScrollEl] = useState<HTMLElement | null>(null)

  useEffect(() => {
    setScrollEl(findScrollParent(wrapperRef.current))
  }, [])

  const virtualizer = useVirtualizer({
    count: posts.length,
    getScrollElement: () => scrollEl,
    estimateSize: () => 220,
    overscan: 6,
  })

  // Auto-load the next page when the bottom sentinel approaches the viewport.
  useEffect(() => {
    const node = sentinelRef.current
    if (!node || !hasNextPage) return
    // IntersectionObserver only accepts an Element (not document.scrollingElement)
    // as `root`; null falls back to the viewport, which is what we want for
    // page-level scrolling.
    const root =
      scrollEl && scrollEl !== document.scrollingElement && scrollEl !== document.documentElement
        ? scrollEl
        : null
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !isFetchingNextPage) {
          fetchNextPage()
        }
      },
      { root, rootMargin: "600px 0px" }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, scrollEl])

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
      <div className="px-4 py-6 text-sm text-destructive">{error.message}</div>
    )
  if (posts.length === 0)
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    )

  const virtualItems = virtualizer.getVirtualItems()
  const totalSize = virtualizer.getTotalSize()

  return (
    <div>
      <div
        ref={wrapperRef}
        style={{
          height: scrollEl ? totalSize : undefined,
          position: "relative",
          width: "100%",
        }}
      >
        {scrollEl
          ? virtualItems.map((virtualItem) => {
              const post = posts[virtualItem.index]
              const banner = renderActivityBanner?.(post)
              return (
                <div
                  key={post.id}
                  ref={virtualizer.measureElement}
                  data-index={virtualItem.index}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
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
                      activePostId === post.id ||
                      activePostId === post.repostOf?.id
                    }
                  />
                </div>
              )
            })
          : // Fallback render (used for the first paint before we resolve the
            // scroll parent) so SSR/initial HTML still shows posts.
            posts.map((post) => {
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
                      activePostId === post.id ||
                      activePostId === post.repostOf?.id
                    }
                  />
                </div>
              )
            })}
      </div>
      <div ref={sentinelRef} aria-hidden className="h-px" />
      {hasNextPage && (
        <div className="flex justify-center py-4 text-xs text-muted-foreground">
          {isFetchingNextPage ? "loading…" : ""}
        </div>
      )}
    </div>
  )
}
