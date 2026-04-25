import { Link, createFileRoute, useRouter } from "@tanstack/react-router"
import { useCallback, useEffect, useState } from "react"
import { IconLock, IconTrash } from "@tabler/icons-react"
import { Button } from "@workspace/ui/components/button"
import { ApiError, api } from "../lib/api"
import { authClient } from "../lib/auth"
import { Avatar } from "../components/avatar"
import { Feed } from "../components/feed"
import type { PublicUser, UserList, UserListMember } from "../lib/api"

export const Route = createFileRoute("/lists/$id")({ component: ListDetail })

function ListDetail() {
  const { id } = Route.useParams()
  const { data: session } = authClient.useSession()
  const router = useRouter()

  const [list, setList] = useState<UserList | null>(null)
  const [members, setMembers] = useState<Array<UserListMember>>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)

  const isOwner = Boolean(session && list && session.user.id === list.ownerId)

  async function refresh() {
    setError(null)
    try {
      const [listRes, memRes] = await Promise.all([api.list(id), api.listMembers(id)])
      setList(listRes.list)
      setMembers(memRes.members)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "load failed")
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    void refresh()
  }, [id])

  const load = useCallback((cursor?: string) => api.listTimeline(id, cursor), [id])

  async function removeList() {
    if (!confirm("Delete this list?")) return
    try {
      await api.deleteList(id)
      router.navigate({ to: "/lists" })
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "delete failed")
    }
  }

  if (loading) {
    return (
      <main>
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">loading…</p>
      </main>
    )
  }
  if (!list) {
    return (
      <main>
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">List not found.</p>
      </main>
    )
  }

  return (
    <main>
      <header className="border-b border-border px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-base font-semibold">{list.title}</h1>
              {list.isPrivate && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <IconLock size={12} /> private
                </span>
              )}
            </div>
            {list.description && (
              <p className="mt-1 text-sm text-muted-foreground">{list.description}</p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              by{" "}
              {list.ownerHandle ? (
                <Link
                  to="/$handle"
                  params={{ handle: list.ownerHandle }}
                  className="hover:underline"
                >
                  @{list.ownerHandle}
                </Link>
              ) : (
                "unknown"
              )}{" "}
              · {list.memberCount} {list.memberCount === 1 ? "member" : "members"}
            </p>
          </div>
          {isOwner && (
            <div className="flex items-center gap-1">
              <Button size="sm" variant="ghost" onClick={() => setShowAdd((v) => !v)}>
                {showAdd ? "Done" : "Manage"}
              </Button>
              <Button size="sm" variant="ghost" onClick={removeList} className="text-destructive">
                <IconTrash size={14} /> Delete
              </Button>
            </div>
          )}
        </div>
        {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      </header>

      {isOwner && showAdd && (
        <ManageMembers
          listId={id}
          members={members}
          onChanged={refresh}
        />
      )}

      <Feed
        load={load}
        emptyMessage={
          isOwner
            ? "no posts yet. Add members to populate this list."
            : "no posts from list members yet."
        }
      />
    </main>
  )
}

function ManageMembers({
  listId,
  members,
  onChanged,
}: {
  listId: string
  members: Array<UserListMember>
  onChanged: () => Promise<void>
}) {
  const [q, setQ] = useState("")
  const [results, setResults] = useState<Array<PublicUser>>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([])
      return
    }
    let cancel = false
    const handle = window.setTimeout(async () => {
      try {
        const { users } = await api.search(q.trim())
        if (!cancel) setResults(users)
      } catch {
        /* ignore */
      }
    }, 200)
    return () => {
      cancel = true
      window.clearTimeout(handle)
    }
  }, [q])

  const memberIds = new Set(members.map((m) => m.id))

  async function add(userId: string) {
    setBusy(true)
    try {
      await api.addListMembers(listId, [userId])
      await onChanged()
    } finally {
      setBusy(false)
    }
  }
  async function remove(userId: string) {
    setBusy(true)
    try {
      await api.removeListMember(listId, userId)
      await onChanged()
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="border-b border-border px-4 py-3">
      <h2 className="text-sm font-semibold">Members</h2>
      {members.length === 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">No members yet.</p>
      ) : (
        <ul className="mt-2 flex flex-wrap gap-2">
          {members.map((m) => (
            <li
              key={m.id}
              className="flex items-center gap-2 rounded-full border border-border bg-card/40 py-1 pl-1 pr-2 text-xs"
            >
              <Avatar
                src={m.avatarUrl}
                initial={(m.displayName ?? m.handle ?? "?").slice(0, 1).toUpperCase()}
                className="size-5"
              />
              <span className="font-medium">@{m.handle ?? m.id.slice(0, 6)}</span>
              <button
                onClick={() => remove(m.id)}
                disabled={busy}
                className="text-muted-foreground hover:text-destructive"
                aria-label="remove"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3">
        <label className="text-xs font-medium text-muted-foreground">Add a user</label>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="search by handle or name"
          className="mt-1 w-full rounded-md border border-border bg-transparent px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
        {results.length > 0 && (
          <ul className="mt-2 divide-y divide-border rounded-md border border-border">
            {results.map((u) => {
              const already = memberIds.has(u.id)
              return (
                <li key={u.id} className="flex items-center justify-between px-2 py-1.5">
                  <div className="flex items-center gap-2">
                    <Avatar
                      src={u.avatarUrl}
                      initial={(u.displayName ?? u.handle ?? "?").slice(0, 1).toUpperCase()}
                      className="size-6"
                    />
                    <div className="text-sm">
                      <div className="font-medium">{u.displayName ?? `@${u.handle}`}</div>
                      <div className="text-xs text-muted-foreground">@{u.handle}</div>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={already ? "ghost" : "default"}
                    disabled={busy || already}
                    onClick={() => add(u.id)}
                  >
                    {already ? "Added" : "Add"}
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
