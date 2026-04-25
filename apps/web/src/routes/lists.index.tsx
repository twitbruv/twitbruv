import { Link, createFileRoute, useRouter } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { IconLock, IconUsers } from "@tabler/icons-react"
import { Button } from "@workspace/ui/components/button"
import { LIST_SLUG_RE, LIST_TITLE_MAX } from "@workspace/validators"
import { ApiError, api } from "../lib/api"
import { authClient } from "../lib/auth"
import type { UserList } from "../lib/api"

export const Route = createFileRoute("/lists/")({ component: ListsIndex })

function ListsIndex() {
  const { data: session, isPending } = authClient.useSession()
  const router = useRouter()
  useEffect(() => {
    if (!isPending && !session) router.navigate({ to: "/login" })
  }, [isPending, session, router])

  const [lists, setLists] = useState<Array<UserList> | null>(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function refresh() {
    try {
      const { lists } = await api.myLists()
      setLists(lists)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "load failed")
      setLists([])
    }
  }
  useEffect(() => {
    if (session) void refresh()
  }, [session])

  return (
    <main>
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h1 className="text-base font-semibold">Lists</h1>
          <p className="text-xs text-muted-foreground">
            Curate users into private or public timelines.
          </p>
        </div>
        <Button size="sm" onClick={() => setCreating((v) => !v)}>
          {creating ? "Cancel" : "New list"}
        </Button>
      </header>

      {creating && (
        <CreateListForm
          onCancel={() => setCreating(false)}
          onCreated={async () => {
            setCreating(false)
            await refresh()
          }}
        />
      )}

      {error && (
        <div className="border-b border-border bg-destructive/10 px-4 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      {lists === null ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">loading…</p>
      ) : lists.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">
          no lists yet. Create one to start curating.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {lists.map((list) => (
            <li key={list.id}>
              <Link
                to="/lists/$id"
                params={{ id: list.id }}
                className="block px-4 py-3 transition hover:bg-muted/40"
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold">{list.title}</h2>
                  {list.isPrivate && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <IconLock size={12} /> private
                    </span>
                  )}
                </div>
                {list.description && (
                  <p className="mt-1 text-sm text-muted-foreground">{list.description}</p>
                )}
                <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                  <IconUsers size={12} />
                  {list.memberCount} {list.memberCount === 1 ? "member" : "members"}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}

function CreateListForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void
  onCreated: () => Promise<void> | void
}) {
  const [title, setTitle] = useState("")
  const [slug, setSlug] = useState("")
  const [description, setDescription] = useState("")
  const [isPrivate, setIsPrivate] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const slugFromTitle = (t: string) =>
    t
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40)
  const effectiveSlug = slug.trim() || slugFromTitle(title)
  const slugValid = LIST_SLUG_RE.test(effectiveSlug)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    if (!title.trim() || !slugValid) {
      setError("Title and slug are required")
      return
    }
    setBusy(true)
    setError(null)
    try {
      await api.createList({
        slug: effectiveSlug,
        title: title.trim(),
        description: description.trim() || undefined,
        isPrivate,
      })
      await onCreated()
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "create failed"
      setError(e instanceof ApiError && e.code === "slug_taken" ? "slug already in use" : msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="border-b border-border px-4 py-3">
      <div className="space-y-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="List name"
          maxLength={LIST_TITLE_MAX}
          className="w-full rounded-md border border-border bg-transparent px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <input
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder={`slug (auto: ${slugFromTitle(title) || "your-slug"})`}
          maxLength={40}
          className="w-full rounded-md border border-border bg-transparent px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          rows={2}
          maxLength={280}
          className="w-full resize-none rounded-md border border-border bg-transparent px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={isPrivate}
            onChange={(e) => setIsPrivate(e.target.checked)}
            className="size-3.5 accent-primary"
          />
          Private (only you can see this list)
        </label>
      </div>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      <div className="mt-2 flex items-center justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button size="sm" type="submit" disabled={busy || !title.trim() || !slugValid}>
          {busy ? "Creating…" : "Create list"}
        </Button>
      </div>
    </form>
  )
}
