import { Link } from "@tanstack/react-router"
import { useInfiniteQuery } from "@tanstack/react-query"
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useWindowVirtualizer } from "@tanstack/react-virtual"
import { UsersIcon } from "@heroicons/react/24/solid"
import { Avatar } from "@workspace/ui/components/avatar"
import { useInfiniteScrollSentinel } from "../lib/use-infinite-scroll-sentinel"
import { PageEmpty, PageError, PageLoadingList } from "./page-surface"
import { VerifiedBadge, resolveBadgeTier } from "./verified-badge"
import type { InfiniteData } from "@tanstack/react-query"
import type { PublicUser, UserListPage } from "../lib/api"

const useIsoLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect

const ESTIMATED_ROW_HEIGHT = 76
const ESTIMATED_BIO_BUMP = 32

function initialFor(user: PublicUser): string {
  return (user.displayName || user.handle || "?").slice(0, 1).toUpperCase()
}

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
  emptyTitle = "No one here yet",
  emptyIcon,
  emptyActions,
}: {
  queryKey: ReadonlyArray<unknown>
  load: (cursor?: string) => Promise<UserListPage>
  emptyMessage?: string
  emptyTitle?: string
  emptyIcon?: React.ReactNode
  emptyActions?: React.ReactNode
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
    ReadonlyArray<unknown>,
    string | undefined
  >({
    queryKey,
    queryFn: ({ pageParam }) => load(pageParam),
    initialPageParam: undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  })

  const users = useMemo(() => data?.pages.flatMap((p) => p.users) ?? [], [data])

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

  if (isPending) return <PageLoadingList />
  if (error) return <PageError message={error.message} />
  if (visibleUsers.length === 0)
    return (
      <PageEmpty
        title={emptyTitle}
        description={emptyMessage}
        icon={emptyIcon ?? <UsersIcon />}
        actions={emptyActions}
      />
    )

  const virtualItems = virtualizer.getVirtualItems()
  const totalSize = virtualizer.getTotalSize()

  return (
    <div className="min-h-0">
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
                className="group flex gap-3 border-b border-neutral px-4 py-3.5 transition-colors hover:bg-base-2/30 focus-visible:bg-base-2/30 focus-visible:outline-none"
              >
                <Avatar
                  initial={initialFor(u)}
                  src={u.avatarUrl}
                  className="size-10"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-1 text-sm font-semibold text-primary">
                    <span className="truncate">
                      {u.displayName || `@${u.handle}`}
                    </span>
                    {(() => {
                      const tier = resolveBadgeTier(u)
                      return tier ? (
                        <VerifiedBadge size={14} role={tier} />
                      ) : null
                    })()}
                  </div>
                  <div className="truncate text-xs text-tertiary">
                    @{u.handle}
                  </div>
                  {u.bio && (
                    <p className="mt-1 line-clamp-2 text-sm/relaxed text-secondary">
                      {u.bio}
                    </p>
                  )}
                </div>
              </Link>
            </div>
          )
        })}
      </div>
      <div ref={sentinelRef} aria-hidden className="h-px" />
      {hasNextPage && (
        <div className="flex justify-center py-4 text-xs text-tertiary">
          {isFetchingNextPage ? "Loading more..." : ""}
        </div>
      )}
    </div>
  )
}
