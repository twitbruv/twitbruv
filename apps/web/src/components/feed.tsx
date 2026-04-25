import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query"
import {
  useVirtualizer,
  useWindowVirtualizer,
} from "@tanstack/react-virtual"
import { SkeletonPostCard } from "@workspace/ui/components/skeleton"
import { PostCard } from "./post-card"
import type { InfiniteData } from "@tanstack/react-query"
import type { FeedPage, Post } from "../lib/api"

type FeedQueryKey = ReadonlyArray<unknown>

interface FeedLoaderPage {
  posts: Array<Post>
  nextCursor: string | null
}

// Walk up the DOM to find the nearest ancestor that scrolls. Returns null when
// the page itself is the scroll container (the common case on mobile and on
// routes that don't pin the feed column).
function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node: HTMLElement | null = el?.parentElement ?? null
  while (node) {
    const style = getComputedStyle(node)
    const overflowY = style.overflowY || style.overflow
    if (/(auto|scroll|overlay)/.test(overflowY)) {
      // documentElement / body show up here with `overflow: visible` already
      // filtered out, but guard anyway so we treat them as window scroll.
      if (node === document.documentElement || node === document.body) {
        return null
      }
      return node
    }
    node = node.parentElement
  }
  return null
}

// useSSR-safe layout effect: skip on the server to avoid the React warning.
const useIsoLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect

const ESTIMATED_POST_HEIGHT = 280

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

  const renderRow = (post: Post) => {
    const banner = renderActivityBanner?.(post)
    return (
      <>
        {banner && (
          <div className="border-b border-border/50 px-4 pt-2">{banner}</div>
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
      </>
    )
  }

  return (
    <FeedList
      posts={posts}
      renderRow={renderRow}
      hasNextPage={!!hasNextPage}
      isFetchingNextPage={isFetchingNextPage}
      fetchNextPage={fetchNextPage}
    />
  )
}

interface FeedListProps {
  posts: Array<Post>
  renderRow: (post: Post) => React.ReactNode
  hasNextPage: boolean
  isFetchingNextPage: boolean
  fetchNextPage: () => void
}

function FeedList(props: FeedListProps) {
  const probeRef = useRef<HTMLDivElement>(null)
  // null = window scroll, HTMLElement = contained scroll, undefined = unresolved
  const [scrollEl, setScrollEl] = useState<HTMLElement | null | undefined>(
    undefined
  )

  useIsoLayoutEffect(() => {
    setScrollEl(findScrollParent(probeRef.current))
  }, [])

  // First paint (and SSR): render non-virtualized so the page isn't blank
  // while the scroll container is being detected. This block also doubles as
  // the no-JS / SSR fallback.
  if (scrollEl === undefined) {
    return (
      <div ref={probeRef}>
        {props.posts.map((post) => (
          <div key={post.id}>{props.renderRow(post)}</div>
        ))}
        {props.hasNextPage && (
          <div className="flex justify-center py-4 text-xs text-muted-foreground">
            {props.isFetchingNextPage ? "loading…" : ""}
          </div>
        )}
      </div>
    )
  }

  if (scrollEl === null) {
    return <WindowFeedList {...props} />
  }
  return <ContainerFeedList {...props} scrollEl={scrollEl} />
}

function WindowFeedList({
  posts,
  renderRow,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
}: FeedListProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const [scrollMargin, setScrollMargin] = useState(0)

  useIsoLayoutEffect(() => {
    const node = wrapperRef.current
    if (!node) return
    // Distance from top of document to top of the list. Items are positioned
    // relative to the list, so we offset by this amount.
    const rect = node.getBoundingClientRect()
    setScrollMargin(rect.top + window.scrollY)
  }, [])

  const virtualizer = useWindowVirtualizer({
    count: posts.length,
    estimateSize: () => ESTIMATED_POST_HEIGHT,
    overscan: 6,
    scrollMargin,
    getItemKey: (i) => posts[i].id,
  })

  useInfiniteScroll(sentinelRef, null, hasNextPage, isFetchingNextPage, fetchNextPage)

  const virtualItems = virtualizer.getVirtualItems()
  const totalSize = virtualizer.getTotalSize()

  return (
    <div>
      <div
        ref={wrapperRef}
        style={{
          height: Math.max(0, totalSize - scrollMargin),
          position: "relative",
          width: "100%",
        }}
      >
        {virtualItems.map((vi) => {
          const post = posts[vi.index]
          return (
            <div
              key={vi.key}
              ref={virtualizer.measureElement}
              data-index={vi.index}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${vi.start - scrollMargin}px)`,
              }}
            >
              {renderRow(post)}
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

function ContainerFeedList({
  posts,
  renderRow,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  scrollEl,
}: FeedListProps & { scrollEl: HTMLElement }) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: posts.length,
    getScrollElement: () => scrollEl,
    estimateSize: () => ESTIMATED_POST_HEIGHT,
    overscan: 6,
    getItemKey: (i) => posts[i].id,
  })

  useInfiniteScroll(
    sentinelRef,
    scrollEl,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage
  )

  const virtualItems = virtualizer.getVirtualItems()
  const totalSize = virtualizer.getTotalSize()

  return (
    <div>
      <div
        ref={wrapperRef}
        style={{ height: totalSize, position: "relative", width: "100%" }}
      >
        {virtualItems.map((vi) => {
          const post = posts[vi.index]
          return (
            <div
              key={vi.key}
              ref={virtualizer.measureElement}
              data-index={vi.index}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${vi.start}px)`,
              }}
            >
              {renderRow(post)}
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

// Auto-load the next page when the bottom sentinel approaches the viewport.
function useInfiniteScroll(
  sentinelRef: React.RefObject<HTMLDivElement | null>,
  root: HTMLElement | null,
  hasNextPage: boolean,
  isFetchingNextPage: boolean,
  fetchNextPage: () => void
) {
  // Latest-callback ref so the observer effect doesn't re-create on every
  // render (which would briefly disconnect/re-observe and miss intersections).
  const fetchRef = useRef(fetchNextPage)
  fetchRef.current = fetchNextPage
  const fetchingRef = useRef(isFetchingNextPage)
  fetchingRef.current = isFetchingNextPage

  useEffect(() => {
    const node = sentinelRef.current
    if (!node || !hasNextPage) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !fetchingRef.current) {
          fetchRef.current()
        }
      },
      { root, rootMargin: "600px 0px" }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [hasNextPage, root, sentinelRef])
}
