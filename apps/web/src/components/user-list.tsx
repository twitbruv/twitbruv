import { Link } from "@tanstack/react-router"
import { useInfiniteQuery } from "@tanstack/react-query"
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useWindowVirtualizer } from "@tanstack/react-virtual"
import type { InfiniteData } from "@tanstack/react-query"
import { useInfiniteScrollSentinel } from "../lib/use-infinite-scroll-sentinel"
import { VerifiedBadge } from "./verified-badge"
import type { PublicUser, UserListPage } from "../lib/api"

const useIsoLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect

const ESTIMATED_ROW_HEIGHT = 76
const ESTIMATED_BIO_BUMP = 32

function estimateRowHeight(user: PublicUser | undefined): number {
  if (!user) return ESTIMATED_ROW_HEIGHT
  return user.bio
    ? ESTIMATED_ROW_HEIGHT + ESTIMATED_BIO_BUMP
    : ESTIMATED_ROW_HEIGHT
}

export function UserList({
  queryKey,
  load,
  emptyMessage = "No users yet.",
}: {
  queryKey: readonly unknown[]
  load: (cursor?: string) => Promise<UserListPage>
  emptyMessage?: string
}) {
  const {
    data,
    error,
    isPending,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery<
    UserListPage,
    Error,
    InfiniteData<UserListPage, string | undefined>,
    readonly unknown[],
    string | undefined
  >({
    queryKey,
    queryFn: ({ pageParam }) => load(pageParam),
    initialPageParam: undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  })

  const users = useMemo(
    () => data?.pages.flatMap((p) => p.users) ?? [],
    [data]
  )

  const visibleUsers = useMemo(
    () => users.filter((u): u is PublicUser & { handle: string } => !!u.handle),
    [users]
  )

  const wrapperRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const [scrollMargin, setScrollMargin] = useState(0)

  useIsoLayoutEffect(() => {
    const node = wrapperRef.current
    if (!node) return
    const rect = node.getBoundingClientRect()
    setScrollMargin(rect.top + window.scrollY)
  }, [visibleUsers.length === 0])

  const virtualizer = useWindowVirtualizer({
    count: visibleUsers.length,
    estimateSize: (i) => estimateRowHeight(visibleUsers[i]),
    overscan: 6,
    scrollMargin,
    getItemKey: (i) => visibleUsers[i].id,
  })

  useInfiniteScrollSentinel(
    sentinelRef,
    !!hasNextPage,
    isFetchingNextPage,
    () => fetchNextPage()
  )

  if (isPending)
    return (
      <div className="px-4 py-6 text-sm text-muted-foreground">loading…</div>
    )
  if (error)
    return (
      <div className="px-4 py-6 text-sm text-destructive">{error.message}</div>
    )
  if (visibleUsers.length === 0)
    return (
      <div className="px-4 py-6 text-sm text-muted-foreground">
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
          height: totalSize,
          position: "relative",
          width: "100%",
        }}
      >
        {virtualItems.map((vi) => {
          const u = visibleUsers[vi.index]
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
              <Link
                to="/$handle"
                params={{ handle: u.handle }}
                className="block border-b border-border px-4 py-3 hover:bg-muted/40"
              >
                <div className="flex items-center gap-1 text-sm font-medium">
                  <span className="truncate">
                    {u.displayName || `@${u.handle}`}
                  </span>
                  {u.isVerified && <VerifiedBadge size={14} role={u.role} />}
                </div>
                <div className="text-xs text-muted-foreground">@{u.handle}</div>
                {u.bio && (
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {u.bio}
                  </p>
                )}
              </Link>
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
