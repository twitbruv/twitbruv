import { Link, createFileRoute, useRouter } from "@tanstack/react-router"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useMemo, useState } from "react"
import { LockClosedIcon, MapPinIcon, UsersIcon } from "@heroicons/react/24/solid"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Switch } from "@workspace/ui/components/switch"
import { Textarea } from "@workspace/ui/components/textarea"
import { LIST_SLUG_RE, LIST_TITLE_MAX } from "@workspace/validators"
import { ApiError, api } from "../lib/api"
import { qk } from "../lib/query-keys"
import { authClient } from "../lib/auth"
import { usePageHeader } from "../components/app-page-header"
import { PageEmpty, PageError, PageLoading } from "../components/page-surface"
import { PageFrame } from "../components/page-frame"
export const Route = createFileRoute("/lists/")({ component: ListsIndex })

function ListsIndex() {
  const { data: session, isPending } = authClient.useSession()
  const router = useRouter()
  const qc = useQueryClient()
  useEffect(() => {
    if (!isPending && !session) router.navigate({ to: "/login" })
  }, [isPending, session, router])

  const [creating, setCreating] = useState(false)

  const {
    data: lists = [],
    error: listsErr,
    isPending: listsPending,
  } = useQuery({
    queryKey: qk.lists.mine(),
    queryFn: async () => (await api.myLists()).lists,
    enabled: !!session,
  })

  const error =
    listsErr instanceof ApiError ? listsErr.message : listsErr ? "load failed" : null

  const refresh = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: qk.lists.mine() })
  }, [qc])

  const toggleCreating = useCallback(() => {
    setCreating((v) => !v)
  }, [])

  const appHeader = useMemo(
    () => ({
      title: "Lists" as const,
      action: (
        <Button size="sm" onClick={toggleCreating}>
          {creating ? "Cancel" : "New list"}
        </Button>
      ),
    }),
    [creating, toggleCreating]
  )
  usePageHeader(appHeader)

  return (
    <PageFrame>
      <main>
        {creating && (
          <CreateListForm
            onCancel={() => setCreating(false)}
            onCreated={async () => {
              setCreating(false)
              await refresh()
            }}
          />
        )}

        {error && <PageError message={error} />}

        {listsPending ? (
          <PageLoading label="Loading…" />
        ) : lists.length === 0 ? (
          <PageEmpty
            title="No lists yet"
            description="Create a list, then add members to build a focused timeline."
          />
        ) : (
          <ul className="divide-y divide-neutral">
            {lists.map((list) => (
              <li
                key={list.id}
                className="flex items-start gap-2 px-4 py-3 transition hover:bg-base-2/40"
              >
                <Link
                  to="/lists/$id"
                  params={{ id: list.id }}
                  className="min-w-0 flex-1"
                >
                  <div className="flex items-center justify-between">
                    <h2 className="flex items-center gap-1.5 text-sm font-semibold">
                      {list.pinnedAt && (
                        <MapPinIcon
                          className="size-3 text-primary"
                        />
                      )}
                      {list.title}
                    </h2>
                    {list.isPrivate && (
                        <span className="flex items-center gap-1 text-xs text-tertiary">
                        <LockClosedIcon className="size-3" /> private
                      </span>
                    )}
                  </div>
                  {list.description && (
                    <p className="mt-1 text-sm text-tertiary">
                      {list.description}
                    </p>
                  )}
                  <p className="mt-1 flex items-center gap-1 text-xs text-tertiary">
                    <UsersIcon className="size-3" />
                    {list.memberCount}{" "}
                    {list.memberCount === 1 ? "member" : "members"}
                  </p>
                </Link>
                <Button
                  size="sm"
                  variant="transparent"
                  aria-label={
                    list.pinnedAt ? "unpin list" : "pin list to profile"
                  }
                  title={
                    list.pinnedAt
                      ? "Pinned to your profile — click to unpin"
                      : "Pin to your profile"
                  }
                  onClick={async (e) => {
                    e.preventDefault()
                    try {
                      if (list.pinnedAt) await api.unpinList(list.id)
                      else await api.pinList(list.id)
                      await refresh()
                    } catch {
                      /* swallow — refresh on next mount */
                    }
                  }}
                >
                  {list.pinnedAt ? (
                    <MapPinIcon
                      className="size-3.5 text-primary"
                    />
                  ) : (
                    <MapPinIcon className="size-3.5" />
                  )}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </PageFrame>
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
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "create failed"
      setError(
        err instanceof ApiError && err.code === "slug_taken"
          ? "slug already in use"
          : msg
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-3 border-b border-neutral px-4 py-3"
    >
      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="list-title">Name</Label>
          <Input
            id="list-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="List name"
            maxLength={LIST_TITLE_MAX}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="list-slug">Slug</Label>
          <Input
            id="list-slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder={`auto: ${slugFromTitle(title) || "your-slug"}`}
            maxLength={40}
            className="text-xs"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="list-desc">Description</Label>
          <Textarea
            id="list-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional"
            rows={2}
            maxLength={280}
            className="min-h-16"
          />
        </div>
        <div className="flex items-center justify-between gap-2 pt-0.5">
          <Label
            htmlFor="list-private"
            className="text-xs text-tertiary"
          >
            Private list
          </Label>
          <Switch
            id="list-private"
            checked={isPrivate}
            onCheckedChange={setIsPrivate}
          />
        </div>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="mt-2 flex items-center justify-end gap-2">
        <Button size="sm" variant="transparent" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button
          size="sm"
          type="submit"
          disabled={busy || !title.trim() || !slugValid}
        >
          {busy ? "Creating…" : "Create list"}
        </Button>
      </div>
    </form>
  )
}
