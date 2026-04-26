import { Link } from "@tanstack/react-router"
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import { useWindowVirtualizer } from "@tanstack/react-virtual"
import { VerifiedBadge } from "./verified-badge"
import { useInfiniteScrollSentinel } from "../lib/use-infinite-scroll-sentinel"
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

  useEffect(() => {
    let cancel = false
    setUsers([])
    setCursor(null)
    setError(null)
    setLoading(true)
    load()
      .then((page) => {
        if (cancel) return
        setUsers(page.users)
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

  const cursorRef = useRef(cursor)
  cursorRef.current = cursor

  async function loadMore() {
    const next = cursorRef.current
    if (!next || loadingMore) return
    setLoadingMore(true)
    try {
      const page = await load(next)
      setUsers((prev) => {
        const seen = new Set(prev.map((u) => u.id))
        const fresh = page.users.filter((u) => !seen.has(u.id))
        return prev.length === 0 ? page.users : [...prev, ...fresh]
      })
      setCursor(page.nextCursor)
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to load")
    } finally {
      setLoadingMore(false)
    }
  }

  const wrapperRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const [scrollMargin, setScrollMargin] = useState(0)

  useIsoLayoutEffect(() => {
    const node = wrapperRef.current
    if (!node) return
    const rect = node.getBoundingClientRect()
    setScrollMargin(rect.top + window.scrollY)
  }, [users.length === 0])

  const virtualizer = useWindowVirtualizer({
    count: users.length,
    estimateSize: (i) => estimateRowHeight(users[i]),
    overscan: 6,
    scrollMargin,
    getItemKey: (i) => users[i].id,
  })

  useInfiniteScrollSentinel(sentinelRef, !!cursor, loadingMore, loadMore)

  if (loading)
    return (
      <div className="px-4 py-6 text-sm text-muted-foreground">loading…</div>
    )
  if (error)
    return <div className="px-4 py-6 text-sm text-destructive">{error}</div>
  if (users.length === 0)
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
          height: Math.max(0, totalSize - scrollMargin),
          position: "relative",
          width: "100%",
        }}
      >
        {virtualItems.map((vi) => {
          const u = users[vi.index]
          if (!u || !u.handle) return null
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
