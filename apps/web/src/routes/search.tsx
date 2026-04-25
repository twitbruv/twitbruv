import { Link, createFileRoute } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import {
  IconBookmark,
  IconBookmarkFilled,
  IconSearch,
  IconX,
} from "@tabler/icons-react"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { PageFrame } from "../components/page-frame"
import { PostCard } from "../components/post-card"
import { VerifiedBadge } from "../components/verified-badge"
import { ApiError, api } from "../lib/api"
import { useMe } from "../lib/me"
import type { Post, PublicUser, SavedSearch } from "../lib/api"

type SearchParams = { q?: string }

export const Route = createFileRoute("/search")({
  component: Search,
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    q: typeof search.q === "string" ? search.q : undefined,
  }),
})

function Search() {
  const navigate = Route.useNavigate()
  const { q: urlQ } = Route.useSearch()
  const { me } = useMe()
  const [draft, setDraft] = useState(() =>
    typeof urlQ === "string" ? urlQ : "",
  )
  const [users, setUsers] = useState<Array<PublicUser>>([])
  const [posts, setPosts] = useState<Array<Post>>([])
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState<Array<SavedSearch>>([])
  const [savedError, setSavedError] = useState<string | null>(null)

  useEffect(() => {
    setDraft(typeof urlQ === "string" ? urlQ : "")
  }, [urlQ])

  const query = draft.trim()
  const activeSavedId = saved.find((s) => s.query === query)?.id ?? null

  // Load saved searches once on mount when signed in.
  useEffect(() => {
    if (!me) {
      setSaved([])
      return
    }
    api
      .savedSearches()
      .then(({ items }) => setSaved(items))
      .catch((e) =>
        setSavedError(
          e instanceof ApiError ? e.message : "couldn't load saved searches",
        ),
      )
  }, [me])

  useEffect(() => {
    if (query.length < 2) {
      setUsers([])
      setPosts([])
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    api
      .search(query)
      .then(({ users: u, posts: p }) => {
        if (cancelled) return
        setUsers(u)
        setPosts(p)
      })
      .catch(() => {
        if (!cancelled) {
          setUsers([])
          setPosts([])
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [query])

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const term = draft.trim()
    if (term.length === 0) return
    navigate({ to: "/search", search: { q: term } })
  }

  async function toggleSaved() {
    if (!me) return
    if (query.length < 2) return
    if (activeSavedId) {
      const id = activeSavedId
      setSaved((prev) => prev.filter((s) => s.id !== id))
      try {
        await api.deleteSavedSearch(id)
      } catch {
        const fallback = await api
          .savedSearches()
          .catch(() => ({ items: saved }))
        setSaved(fallback.items)
      }
    } else {
      try {
        const { item } = await api.saveSearch(query)
        setSaved((prev) =>
          prev.some((s) => s.id === item.id) ? prev : [...prev, item],
        )
      } catch (e) {
        setSavedError(
          e instanceof ApiError ? e.message : "couldn't save search",
        )
      }
    }
  }

  return (
    <PageFrame>
      <main>
        <header className="border-b border-border px-4 py-3">
          <form onSubmit={onSubmit} className="relative flex-1">
            <IconSearch
              size={14}
              stroke={1.75}
              className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder='search people and posts… try "from:lucas has:media"'
              className="pl-7"
              aria-label="search"
            />
          </form>
          {me && query.length >= 2 && (
            <div className="mt-2 flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={toggleSaved}
                className="flex items-center gap-1 text-primary hover:underline"
                aria-pressed={Boolean(activeSavedId)}
              >
                {activeSavedId ? (
                  <IconBookmarkFilled size={14} stroke={1.75} />
                ) : (
                  <IconBookmark size={14} stroke={1.75} />
                )}
                <span>{activeSavedId ? "Saved" : "Save this search"}</span>
              </button>
              <details className="text-muted-foreground">
                <summary className="cursor-pointer select-none">Operators</summary>
                <div className="mt-1 max-w-md text-right text-[11px] leading-snug">
                  <code>from:user</code> · <code>to:user</code> ·{" "}
                  <code>has:media</code> · <code>has:link</code> ·{" "}
                  <code>has:poll</code> · <code>lang:en</code> ·{" "}
                  <code>since:YYYY-MM-DD</code> · <code>until:YYYY-MM-DD</code>{" "}
                  · <code>min_likes:10</code> · <code>min_replies:5</code>
                </div>
              </details>
            </div>
          )}
          {savedError && (
            <p className="mt-1 text-xs text-destructive">{savedError}</p>
          )}
        </header>

        {me && saved.length > 0 && (
          <section className="border-b border-border px-4 py-2">
            <h2 className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Saved searches
            </h2>
            <div className="flex flex-wrap gap-1.5">
              {saved.map((s) => (
                <span key={s.id} className="inline-flex items-center gap-0.5">
                  <Button
                    size="sm"
                    variant={s.query === query ? "default" : "ghost"}
                    onClick={() => {
                      setDraft(s.query)
                      navigate({ to: "/search", search: { q: s.query } })
                    }}
                    className="rounded-full"
                  >
                    <span className="max-w-[18ch] truncate">{s.query}</span>
                  </Button>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label={`delete saved search ${s.query}`}
                    onClick={async () => {
                      setSaved((prev) => prev.filter((x) => x.id !== s.id))
                      try {
                        await api.deleteSavedSearch(s.id)
                      } catch {
                        /* refetch on next mount */
                      }
                    }}
                  >
                    <IconX size={10} />
                  </Button>
                </span>
              ))}
            </div>
          </section>
        )}

        {query.length < 2 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            enter at least 2 characters to search people and posts. operators
            like <code>from:</code>, <code>has:media</code>, and{" "}
            <code>since:</code> are also supported.
          </p>
        ) : loading ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">searching…</p>
        ) : (
          <>
            {users.length > 0 && (
              <section className="border-b border-border">
                <h2 className="px-4 py-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  People
                </h2>
                {users.map((u) =>
                  u.handle ? (
                    <Link
                      key={u.id}
                      to="/$handle"
                      params={{ handle: u.handle }}
                      className="block border-t border-border px-4 py-3 hover:bg-muted/40"
                    >
                      <div className="flex items-center gap-1 text-sm font-medium">
                        <span className="truncate">
                          {u.displayName || `@${u.handle}`}
                        </span>
                        {u.isVerified && (
                          <VerifiedBadge size={14} role={u.role} />
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        @{u.handle}
                      </div>
                      {u.bio && (
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {u.bio}
                        </p>
                      )}
                    </Link>
                  ) : null,
                )}
              </section>
            )}
            {posts.length > 0 && (
              <section>
                <h2 className="px-4 py-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Posts
                </h2>
                {posts.map((p) => (
                  <PostCard key={p.id} post={p} />
                ))}
              </section>
            )}
            {users.length === 0 && posts.length === 0 && (
              <p className="px-4 py-6 text-sm text-muted-foreground">
                no matches.
              </p>
            )}
          </>
        )}
      </main>
    </PageFrame>
  )
}
