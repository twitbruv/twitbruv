import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query"
import { useElementScrollRestoration } from "@tanstack/react-router"
import { useVirtualizer, useWindowVirtualizer } from "@tanstack/react-virtual"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { PageEmpty, PageError } from "./page-surface"
import { FeedChainPreview } from "./feed-chain-preview"
import { FeedPostCard } from "./feed-post-card"
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
const ESTIMATED_MEDIA_BUMP = 320
const ESTIMATED_LINK_CARD_BUMP = 260
const ESTIMATED_QUOTE_BUMP = 110
const ESTIMATED_ARTICLE_BUMP = 90
const ESTIMATED_POLL_BUMP = 140
const ESTIMATED_CHAIN_GAP = 36

function estimateInnerCardHeight(post: Post): number {
  const target = post.repostOf ?? post
  let height = ESTIMATED_POST_HEIGHT
  if (target.media && target.media.length > 0) height += ESTIMATED_MEDIA_BUMP
  const hasRichLinkCard =
    target.cards?.some((c) => c.provider !== "article") ?? false
  if (hasRichLinkCard) {
    height += ESTIMATED_LINK_CARD_BUMP
  }
  if (target.cards?.some((c) => c.provider === "article"))
    height += ESTIMATED_ARTICLE_BUMP
  if (target.poll) height += ESTIMATED_POLL_BUMP
  if (target.quoteOf) height += ESTIMATED_QUOTE_BUMP
  return height
}

function estimatePostHeight(post: Post | undefined): number {
  if (!post) return ESTIMATED_POST_HEIGHT
  if (post.chainPreview) {
    return (
      estimateInnerCardHeight(post.chainPreview.root) +
      ESTIMATED_CHAIN_GAP +
      estimateInnerCardHeight(post)
    )
  }
  return estimateInnerCardHeight(post)
}

export function Feed({
  queryKey,
  load,
  emptyMessage = "Nothing here yet.",
  emptyState,
  prependItem,
  hideReplies = false,
  onlyReplies = false,
  renderActivityBanner,
  chainPreview = false,
  quietPending = false,
  onReady,
}: {
  queryKey: FeedQueryKey
  load: (cursor?: string) => Promise<FeedLoaderPage | FeedPage>
  /** Legacy fallback. Used when `emptyState` is not provided. */
  emptyMessage?: string
  /** Fully-custom empty state. Takes precedence over `emptyMessage`. */
  emptyState?: React.ReactNode
  prependItem?: Post | null
  hideReplies?: boolean
  onlyReplies?: boolean
  /** Optional banner rendered above each post card (e.g. "Lucas liked this"
   *  on the network feed). Returning null skips the banner for that row. */
  renderActivityBanner?: (post: Post) => React.ReactNode
  /** When true, render root → gap → leaf for posts with `chainPreview` (home-style feeds). */
  chainPreview?: boolean
  /** When true, render `null` instead of the skeleton placeholders during the
   *  initial pending state. Lets a parent show its own loading affordance. */
  quietPending?: boolean
  /** Fired the first time the query settles with data (or no data). The parent
   *  can use this to know when it's safe to drop its own loading state. */
  onReady?: () => void
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

  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady
  useEffect(() => {
    if (!isPending) onReadyRef.current?.()
  }, [isPending])

  if (isPending) {
    if (quietPending) return null
    return (
      <div>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex gap-3 px-4 py-4">
            <Skeleton className="size-10 shrink-0 rounded-full" />
            <div className="flex-1 space-y-3">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          </div>
        ))}
      </div>
    )
  }
  if (error) return <PageError message={error.message} className="px-4 py-6" />
  if (posts.length === 0) {
    if (emptyState) return <>{emptyState}</>
    return <PageEmpty title="Nothing here yet" description={emptyMessage} />
  }

  const renderRow = (post: Post) => {
    const banner = renderActivityBanner?.(post)
    return (
      <>
        {banner && <div className="pt-2 pr-4 pl-[68px]">{banner}</div>}
        {chainPreview && post.chainPreview ? (
          <FeedChainPreview post={post} />
        ) : (
          <FeedPostCard post={post} />
        )}
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
          <div className="text-muted-foreground flex justify-center py-4 text-xs">
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
  const scrollEntry = useElementScrollRestoration({
    getElement: () => window,
  })

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
    estimateSize: (i) => estimatePostHeight(posts[i]),
    initialOffset: scrollEntry?.scrollY,
    overscan: 6,
    scrollMargin,
    getItemKey: (i) => posts[i].id,
  })

  useInfiniteScroll(
    sentinelRef,
    null,
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
        <div className="text-muted-foreground flex justify-center py-4 text-xs">
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
  const scrollEntry = useElementScrollRestoration({
    getElement: () => scrollEl,
  })

  const virtualizer = useVirtualizer({
    count: posts.length,
    getScrollElement: () => scrollEl,
    estimateSize: (i) => estimatePostHeight(posts[i]),
    initialOffset: scrollEntry?.scrollY,
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
        <div className="text-muted-foreground flex justify-center py-4 text-xs">
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
