import { Link } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { Button } from "@workspace/ui/components/button"
import { VerifiedBadge } from "./verified-badge"
import type { PublicUser, UserListPage } from "../lib/api"

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

  async function more() {
    if (!cursor || loadingMore) return
    setLoadingMore(true)
    try {
      const page = await load(cursor)
      setUsers((prev) => [...prev, ...page.users])
      setCursor(page.nextCursor)
    } finally {
      setLoadingMore(false)
    }
  }

  if (loading) return <div className="px-4 py-6 text-sm text-muted-foreground">loading…</div>
  if (error) return <div className="px-4 py-6 text-sm text-destructive">{error}</div>
  if (users.length === 0)
    return <div className="px-4 py-6 text-sm text-muted-foreground">{emptyMessage}</div>

  return (
    <div>
      {users.map((u) =>
        u.handle ? (
          <Link
            key={u.id}
            to="/$handle"
            params={{ handle: u.handle }}
            className="block border-b border-border px-4 py-3 hover:bg-muted/40"
          >
            <div className="flex items-center gap-1 text-sm font-medium">
              <span className="truncate">{u.displayName || `@${u.handle}`}</span>
              {u.isVerified && <VerifiedBadge size={14} />}
            </div>
            <div className="text-xs text-muted-foreground">@{u.handle}</div>
            {u.bio && <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{u.bio}</p>}
          </Link>
        ) : null,
      )}
      {cursor && (
        <div className="flex justify-center py-3">
          <Button variant="ghost" size="sm" onClick={more} disabled={loadingMore}>
            {loadingMore ? "loading…" : "load more"}
          </Button>
        </div>
      )}
    </div>
  )
}
