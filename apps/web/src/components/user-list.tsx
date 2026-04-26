import { Link } from "@tanstack/react-router"
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useWindowVirtualizer } from "@tanstack/react-virtual"
import { useInfiniteScrollSentinel } from "../lib/use-infinite-scroll-sentinel"
import { VerifiedBadge } from "./verified-badge"
import type { PublicUser, UserListPage } from "../lib/api"

const useIsoLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect

const ESTIMATED_ROW_HEIGHT = 76
const ESTIMATED_BIO_BUMP = 32
const LOAD_MORE_BACKOFF_MS = 3000

function estimateRowHeight(user: PublicUser | undefined): number {
  if (!user) return ESTIMATED_ROW_HEIGHT
  return user.bio
    ? ESTIMATED_ROW_HEIGHT + ESTIMATED_BIO_BUMP
    : ESTIMATED_ROW_HEIGHT
}

export function UserList({
  load,
  emptyMessage = "No users yet.",
}: {
  load: (cursor?: string) => Promise<UserListPage>
  emptyMessage?: string
}) {
  const [users, setUsers] = useState<Array<PublicUser>>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Bumped on every source change so stale fetches (initial load or
  // pagination) are discarded if `load` swapped while they were in flight.
  const requestIdRef = useRef(0)

  useEffect(() => {
    const requestId = ++requestIdRef.current
    setUsers([])
    setCursor(null)
    setError(null)
    setLoading(true)
    setLoadingMore(false)
    load()
      .then((page) => {
        if (requestId !== requestIdRef.current) return
        setUsers(page.users)
        setCursor(page.nextCursor)
      })
      .catch((e) => {
        if (requestId !== requestIdRef.current) return
        setError(e instanceof Error ? e.message : "failed to load")
      })
      .finally(() => {
        if (requestId !== requestIdRef.current) return
        setLoading(false)
      })
  }, [load])

  const cursorRef = useRef(cursor)
  cursorRef.current = cursor
  const usersRef = useRef(users)
  usersRef.current = users

  async function loadMore() {
    const next = cursorRef.current
    if (!next || loadingMore) return
    const requestId = requestIdRef.current
    setLoadingMore(true)
    try {
      const page = await load(next)
      if (requestId !== requestIdRef.current) return
      setUsers((prev) => {
        const seen = new Set(prev.map((u) => u.id))
        const fresh = page.users.filter((u) => !seen.has(u.id))
        return [...prev, ...fresh]
      })
      setCursor(page.nextCursor)
    } catch (e) {
      if (requestId !== requestIdRef.current) return
      // Only surface the full-page error when the initial load left us
      // empty; otherwise the populated list shouldn't be replaced.
      if (usersRef.current.length === 0) {
        setError(e instanceof Error ? e.message : "failed to load")
      }
      // Hold loadingMore high through a backoff window. The sentinel
      // observer is torn down while loading is true and re-attached when
      // it flips false; without this delay it would re-fire its initial
      // intersection callback immediately and busy-loop the API on a
      // persistent failure.
      await new Promise((resolve) => setTimeout(resolve, LOAD_MORE_BACKOFF_MS))
    } finally {
      if (requestId === requestIdRef.current) {
        setLoadingMore(false)
      }
    }
  }

  // Some users in a page can have `handle: null` (registered but never
  // claimed). The link-row renderer skips them, which would leave empty
  // reserved space in the virtualizer — pre-filter so the virtualizer
  // only allocates rows it can actually render.
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

  useInfiniteScrollSentinel(sentinelRef, !!cursor, loadingMore, loadMore)

  if (loading)
    return (
      <div className="px-4 py-6 text-sm text-muted-foreground">loading…</div>
    )
  if (error)
    return <div className="px-4 py-6 text-sm text-destructive">{error}</div>
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
      {cursor && (
        <div className="flex justify-center py-4 text-xs text-muted-foreground">
          {loadingMore ? "loading…" : ""}
        </div>
      )}
    </div>
  )
}
