import { Link, createFileRoute, useRouter } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { IconLock, IconUsers } from "@tabler/icons-react"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { ApiError, api } from "../lib/api"
import { authClient } from "../lib/auth"
import { PageFrame } from "../components/page-frame"
import type { Community } from "../lib/api"

export const Route = createFileRoute("/communities")({ component: CommunitiesIndex })

function CommunitiesIndex() {
  const router = useRouter()
  const { data: session } = authClient.useSession()
  const [communities, setCommunities] = useState<Array<Community> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  async function refresh() {
    try {
      const { communities: rows } = await api.communities()
      setCommunities(rows)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "couldn't load communities")
      setCommunities([])
    }
  }
  useEffect(() => {
    refresh()
  }, [])

  return (
    <PageFrame>
      <main>
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h1 className="text-base font-semibold">Communities</h1>
            <p className="text-xs text-muted-foreground">
              Public + restricted communities, newest first.
            </p>
          </div>
          {session && (
            <Button size="sm" onClick={() => setCreating((v) => !v)}>
              {creating ? "Cancel" : "New community"}
            </Button>
          )}
        </header>

        {creating && session && (
          <CreateCommunityForm
            onCancel={() => setCreating(false)}
            onCreated={(slug) => {
              setCreating(false)
              router.navigate({ to: "/c/$slug", params: { slug } })
            }}
          />
        )}

        {error && (
          <p className="border-b border-border bg-destructive/10 px-4 py-2 text-xs text-destructive">
            {error}
          </p>
        )}

        {communities === null ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">loading…</p>
        ) : communities.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            No communities yet — be the first.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {communities.map((c) => (
              <li key={c.id}>
                <Link
                  to="/c/$slug"
                  params={{ slug: c.slug }}
                  className="block px-4 py-3 transition hover:bg-muted/40"
                >
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold">{c.name}</h2>
                    {c.visibility !== "public" && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <IconLock size={12} /> {c.visibility}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">/c/{c.slug}</p>
                  {c.description && (
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                      {c.description}
                    </p>
                  )}
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <IconUsers size={12} />
                    {c.memberCount} {c.memberCount === 1 ? "member" : "members"}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </PageFrame>
  )
}

function CreateCommunityForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void
  onCreated: (slug: string) => void
}) {
  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [description, setDescription] = useState("")
  const [visibility, setVisibility] =
    useState<"public" | "restricted" | "private">("public")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const slugFromName = (n: string) =>
    n
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40)
  const effectiveSlug = slug.trim() || slugFromName(name)
  const slugValid = /^[a-z0-9-]{2,40}$/i.test(effectiveSlug)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    if (!name.trim() || !slugValid) {
      setError("Name and slug are required (slug 2-40, lowercase + dash).")
      return
    }
    setBusy(true)
    setError(null)
    try {
      const { community } = await api.createCommunity({
        name: name.trim(),
        slug: effectiveSlug,
        description: description.trim() || undefined,
        visibility,
      })
      onCreated(community.slug)
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "create failed"
      setError(
        e instanceof ApiError && e.code === "slug_taken"
          ? "slug already in use"
          : msg,
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 border-b border-border px-4 py-3">
      <div className="space-y-1">
        <Label htmlFor="community-name">Name</Label>
        <Input
          id="community-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          required
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="community-slug">Slug</Label>
        <Input
          id="community-slug"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder={`auto: ${slugFromName(name) || "your-slug"}`}
          maxLength={40}
        />
        <p className="text-[11px] text-muted-foreground">
          /c/{effectiveSlug || "<slug>"}
        </p>
      </div>
      <div className="space-y-1">
        <Label htmlFor="community-description">Description</Label>
        <Input
          id="community-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={280}
          placeholder="Optional"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="community-visibility">Visibility</Label>
        <select
          id="community-visibility"
          value={visibility}
          onChange={(e) =>
            setVisibility(e.target.value as "public" | "restricted" | "private")
          }
          className="rounded-md border border-border bg-background px-2 py-1 text-xs"
        >
          <option value="public">Public — anyone can join</option>
          <option value="restricted">Restricted — owner approves new members</option>
          <option value="private">Private — invite-only, hidden to non-members</option>
        </select>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button size="sm" type="submit" disabled={busy || !name.trim() || !slugValid}>
          {busy ? "Creating…" : "Create"}
        </Button>
      </div>
    </form>
  )
}
