import { createFileRoute, useRouter } from "@tanstack/react-router"
import { useCallback, useEffect, useMemo, useState } from "react"
import { LockIcon, TrashIcon, XIcon } from "@phosphor-icons/react"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { trackedAction } from "../lib/analytics"
import { ApiError, api } from "../lib/api"
import { authClient } from "../lib/auth"
import { usePageHeader } from "../components/app-page-header"
import { Avatar } from "../components/avatar"
import { Feed } from "../components/feed"
import { PageEmpty, PageError, PageLoading } from "../components/page-surface"
import { PageFrame } from "../components/page-frame"
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
      const [listRes, memRes] = await Promise.all([
        api.list(id),
        api.listMembers(id),
      ])
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

  const load = useCallback(
    (cursor?: string) => api.listTimeline(id, cursor),
    [id]
  )

  const removeList = useCallback(async () => {
    if (!confirm("Delete this list?")) return
    try {
      await trackedAction(
        "list_deleted",
        () => api.deleteList(id),
        () => ({ list_id: id }),
      )
      router.navigate({ to: "/lists" })
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "delete failed")
    }
  }, [id, router])

  const appHeader = useMemo(() => {
    if (loading || !list) return null
    return {
      className: "items-start",
      title: (
        <span className="inline-flex min-w-0 items-center gap-2">
          <span className="truncate">{list.title}</span>
          {list.isPrivate ? (
            <span className="inline-flex shrink-0 items-center gap-0.5 text-xs font-normal text-muted-foreground">
              <LockIcon size={12} />
              Private
            </span>
          ) : null}
        </span>
      ),
      action: isOwner ? (
        <div className="flex shrink-0 items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowAdd((v) => !v)}
          >
            {showAdd ? "Done" : "Manage"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={removeList}
            className="text-destructive"
          >
            <TrashIcon size={14} /> Delete
          </Button>
        </div>
      ) : undefined,
    }
  }, [loading, list, isOwner, showAdd, removeList])

  usePageHeader(appHeader)

  if (loading) {
    return (
      <PageFrame>
        <main>
          <PageLoading />
        </main>
      </PageFrame>
    )
  }
  if (!list) {
    return (
      <PageFrame>
        <main>
          {error ? (
            <PageError message={error} />
          ) : (
            <PageEmpty
              title="List not found"
              description="It may have been deleted or you may not have access."
            />
          )}
        </main>
      </PageFrame>
    )
  }

  return (
    <PageFrame>
      <main>
        {error && <PageError message={error} className="border-b border-border" />}

        {isOwner && showAdd && (
          <ManageMembers listId={id} members={members} onChanged={refresh} />
        )}

        <Feed
          queryKey={["listTimeline", id]}
          load={load}
          emptyMessage={
            isOwner
              ? "no posts yet. Add members to populate this list."
              : "no posts from list members yet."
          }
        />
      </main>
    </PageFrame>
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
      } catch {}
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
      await trackedAction(
        "list_members_added",
        () => api.addListMembers(listId, [userId]),
        () => ({ list_id: listId, added_count: 1 }),
      )
      await onChanged()
    } finally {
      setBusy(false)
    }
  }
  async function remove(userId: string) {
    setBusy(true)
    try {
      await trackedAction(
        "list_member_removed",
        () => api.removeListMember(listId, userId),
        () => ({ list_id: listId, removed_user_id: userId }),
      )
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
              className="flex items-center gap-2 rounded-full border border-border bg-card/40 py-1 pr-2 pl-1 text-xs"
            >
              <Avatar
                src={m.avatarUrl}
                initial={(m.displayName ?? m.handle ?? "?")
                  .slice(0, 1)
                  .toUpperCase()}
                className="size-5"
              />
              <span className="font-medium">
                @{m.handle ?? m.id.slice(0, 6)}
              </span>
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                onClick={() => remove(m.id)}
                disabled={busy}
                className="shrink-0 text-muted-foreground hover:text-destructive"
                aria-label="Remove"
              >
                <XIcon size={12} />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3">
        <Label htmlFor="list-member-search" className="text-xs text-muted-foreground">
          Add a user
        </Label>
        <Input
          id="list-member-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by handle or name"
          className="mt-1.5 h-8 text-sm"
        />
        {results.length > 0 && (
          <ul className="mt-2 divide-y divide-border rounded-md border border-border">
            {results.map((u) => {
              const already = memberIds.has(u.id)
              return (
                <li
                  key={u.id}
                  className="flex items-center justify-between px-2 py-1.5"
                >
                  <div className="flex items-center gap-2">
                    <Avatar
                      src={u.avatarUrl}
                      initial={(u.displayName ?? u.handle ?? "?")
                        .slice(0, 1)
                        .toUpperCase()}
                      className="size-6"
                    />
                    <div className="text-sm">
                      <div className="font-medium">
                        {u.displayName ?? `@${u.handle}`}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        @{u.handle}
                      </div>
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
