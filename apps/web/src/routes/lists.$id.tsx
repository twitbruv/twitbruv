import { createFileRoute, useRouter } from "@tanstack/react-router"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback, useDeferredValue, useMemo, useState } from "react"
import {
  ListBulletIcon,
  LockClosedIcon,
  PencilSquareIcon,
  TrashIcon,
  UserPlusIcon,
  XMarkIcon,
} from "@heroicons/react/24/solid"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Avatar } from "@workspace/ui/components/avatar"
import { ApiError, api } from "../lib/api"
import { authClient } from "../lib/auth"
import { qk } from "../lib/query-keys"
import { usePageHeader } from "../components/app-page-header"
import { Feed } from "../components/feed"
import { PageEmpty, PageError, PageLoading } from "../components/page-surface"
import { PageFrame } from "../components/page-frame"
import type { PublicUser, UserListMember } from "../lib/api"

export const Route = createFileRoute("/lists/$id")({ component: ListDetail })

function ListDetail() {
  const { id } = Route.useParams()
  const qc = useQueryClient()
  const { data: session } = authClient.useSession()
  const router = useRouter()

  const [opError, setOpError] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)

  const listQuery = useQuery({
    queryKey: qk.lists.detail(id),
    queryFn: async () => (await api.list(id)).list,
  })
  const membersQuery = useQuery({
    queryKey: qk.lists.members(id),
    queryFn: async () => (await api.listMembers(id)).members,
  })

  const list = listQuery.data ?? null
  const members = membersQuery.data ?? []
  const loading = listQuery.isPending || membersQuery.isPending
  const fetchErr = listQuery.error ?? membersQuery.error
  const error =
    fetchErr instanceof ApiError
      ? fetchErr.message
      : fetchErr
        ? "load failed"
        : null

  const isOwner = Boolean(session && list && session.user.id === list.ownerId)

  async function refresh() {
    setOpError(null)
    await Promise.all([
      qc.invalidateQueries({ queryKey: qk.lists.detail(id) }),
      qc.invalidateQueries({ queryKey: qk.lists.members(id) }),
    ])
  }

  const load = useCallback(
    (cursor?: string) => api.listTimeline(id, cursor),
    [id]
  )

  const removeList = useCallback(async () => {
    if (!confirm("Delete this list?")) return
    try {
      await api.deleteList(id)
      await qc.invalidateQueries({ queryKey: qk.lists.mine() })
      router.navigate({ to: "/lists" })
    } catch (e) {
      setOpError(e instanceof ApiError ? e.message : "delete failed")
    }
  }, [id, router, qc])

  const appHeader = useMemo(() => {
    if (loading || !list) return null
    return {
      className: "items-start",
      title: (
        <span className="inline-flex min-w-0 items-center gap-2">
          <span className="truncate">{list.title}</span>
          {list.isPrivate ? (
            <span className="inline-flex shrink-0 items-center gap-0.5 text-xs font-normal text-tertiary">
              <LockClosedIcon className="size-3" />
              Private
            </span>
          ) : null}
        </span>
      ),
      action: isOwner ? (
        <div className="flex shrink-0 items-center gap-1">
          <Button
            size="sm"
            variant="transparent"
            onClick={() => setShowAdd((v) => !v)}
          >
            {showAdd ? "Done" : "Manage"}
          </Button>
          <Button
            size="sm"
            variant="transparent"
            onClick={removeList}
            className="text-destructive"
          >
            <TrashIcon className="size-3.5" /> Delete
          </Button>
        </div>
      ) : undefined,
    }
  }, [loading, list, isOwner, showAdd, removeList])

  usePageHeader(appHeader)

  if (loading) {
    return (
      <PageFrame>
        <PageLoading />
      </PageFrame>
    )
  }
  if (!list) {
    return (
      <PageFrame>
        {error ? (
          <PageError message={error} />
        ) : (
          <PageEmpty
            icon={<ListBulletIcon />}
            title="List not found"
            description="It may have been deleted or you may not have access."
          />
        )}
      </PageFrame>
    )
  }

  return (
    <PageFrame>
      {(error || opError) && (
        <PageError
          message={error ?? opError ?? ""}
          className="border-b border-neutral"
        />
      )}

      {isOwner && showAdd && (
        <ManageMembers listId={id} members={members} onChanged={refresh} />
      )}

      <Feed
        queryKey={qk.lists.timeline(id)}
        load={load}
        emptyState={
          <PageEmpty
            icon={isOwner ? <UserPlusIcon /> : <PencilSquareIcon />}
            title={isOwner ? "This list is empty" : "Nothing from members yet"}
            description={
              isOwner
                ? "Add members to start building a focused timeline."
                : "When list members post, you'll see them here."
            }
            actions={
              isOwner ? (
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => setShowAdd(true)}
                >
                  <UserPlusIcon className="size-3.5" />
                  Add members
                </Button>
              ) : null
            }
          />
        }
      />
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
  const [busy, setBusy] = useState(false)

  const deferredQ = useDeferredValue(q.trim())
  const { data: searchResult } = useQuery({
    queryKey: qk.search(deferredQ),
    queryFn: () => api.search(deferredQ),
    enabled: deferredQ.length >= 2,
  })
  const results: Array<PublicUser> = searchResult?.users ?? []

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
    <section className="border-b border-neutral px-4 py-3">
      <h2 className="text-sm font-semibold">Members</h2>
      {members.length === 0 ? (
        <p className="mt-1 text-xs text-tertiary">No members yet.</p>
      ) : (
        <ul className="mt-2 flex flex-wrap gap-2">
          {members.map((m) => (
            <li
              key={m.id}
              className="bg-card/40 flex items-center gap-2 rounded-full border border-neutral py-1 pr-2 pl-1 text-xs"
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
                size="sm"
                variant="transparent"
                onClick={() => remove(m.id)}
                disabled={busy}
                className="hover:text-destructive shrink-0 text-tertiary"
                aria-label="Remove"
              >
                <XMarkIcon className="size-3" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3">
        <Label htmlFor="list-member-search" className="text-xs text-tertiary">
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
          <ul className="mt-2 divide-y divide-neutral rounded-md border border-neutral">
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
                      <div className="text-xs text-tertiary">@{u.handle}</div>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={already ? "transparent" : "outline"}
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
