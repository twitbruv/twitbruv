import { Link, createFileRoute } from "@tanstack/react-router"
import { useEffect, useMemo, useState } from "react"
import {
  BookmarkIcon,
  HorseIcon,
  MagnifyingGlassIcon,
  XIcon,
} from "@phosphor-icons/react"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import { usePageHeader } from "../components/app-page-header"
import { PageEmpty, PageLoading } from "../components/page-surface"
import { PageFrame } from "../components/page-frame"
import { PostCard } from "../components/post-card"
import { VerifiedBadge } from "../components/verified-badge"
import { trackedAction } from "../lib/analytics"
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
  const { q: urlQ } = Route.useSearch()
  return <SearchInner key={urlQ ?? ""} initialQuery={urlQ ?? ""} />
}

function SearchInner({ initialQuery }: { initialQuery: string }) {
  const navigate = Route.useNavigate()
  const { me } = useMe()
  const [draft, setDraft] = useState(initialQuery)
  const [users, setUsers] = useState<Array<PublicUser>>([])
  const [posts, setPosts] = useState<Array<Post>>([])
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState<Array<SavedSearch>>([])
  const [savedError, setSavedError] = useState<string | null>(null)

  const query = draft.trim()
  const activeSavedId = saved.find((s) => s.query === query)?.id ?? null

  const isChessSearch = query.toLowerCase() === "chess"
  const [challengeTarget, setChallengeTarget] = useState("")
  const [challengeError, setChallengeError] = useState<string | null>(null)
  
  async function submitChallenge(e: React.FormEvent) {
    e.preventDefault()
    setChallengeError(null)
    const targetHandle = challengeTarget.replace(/^@/, "").trim()
    try {
      const { user } = await api.user(targetHandle)
      const { game } = await trackedAction(
        "chess_game_created",
        () => api.chessCreateGame(user.id),
        (res) => ({ game_id: res.game.id, opponent_id: user.id }),
      )
      navigate({ to: "/chess/$id", params: { id: game.id } })
    } catch (err) {
      setChallengeError("Could not find user or challenge failed.")
    }
  }

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

  const appHeader = useMemo(
    () => ({ title: "Search" as const }),
    []
  )
  usePageHeader(appHeader)

  async function toggleSaved() {
    if (!me) return
    if (query.length < 2) return
    if (activeSavedId) {
      const id = activeSavedId
      setSaved((prev) => prev.filter((s) => s.id !== id))
      try {
        await trackedAction(
          "search_saved_deleted",
          () => api.deleteSavedSearch(id),
          () => ({ search_id: id }),
        )
      } catch {
        const fallback = await api
          .savedSearches()
          .catch(() => ({ items: saved }))
        setSaved(fallback.items)
      }
    } else {
      try {
        const { item } = await trackedAction(
          "search_saved",
          () => api.saveSearch(query),
          (res) => ({ search_id: res.item.id, query_length: query.length }),
        )
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
        <div className="border-b border-border">
          <form onSubmit={onSubmit} className="px-4 py-3">
            <div className="relative">
              <MagnifyingGlassIcon
                size={14}
                className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder='Search people and posts. Try "from:lucas has:media".'
                className="pl-7"
                aria-label="search"
              />
            </div>
            {me && query.length >= 2 && (
              <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                <button
                  type="button"
                  onClick={toggleSaved}
                  className="text-primary hover:underline"
                  aria-pressed={Boolean(activeSavedId)}
                >
                  {activeSavedId ? (
                    <span className="inline-flex items-center gap-1">
                      <BookmarkIcon size={14} weight="fill" />
                      Saved
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1">
                      <BookmarkIcon size={14} />
                      Save this search
                    </span>
                  )}
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
              <Alert variant="destructive" className="mt-2 text-left">
                <AlertDescription className="text-xs">{savedError}</AlertDescription>
              </Alert>
            )}
          </form>
        </div>

        {me && saved.length > 0 && (
          <section className="border-b border-border px-4 py-2">
            <h2 className="mb-1 text-xs font-medium text-muted-foreground">
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
                        await trackedAction(
                          "search_saved_deleted",
                          () => api.deleteSavedSearch(s.id),
                          () => ({ search_id: s.id }),
                        )
                      } catch {
                        /* refetch on next mount */
                      }
                    }}
                  >
                    <XIcon size={10} />
                  </Button>
                </span>
              ))}
            </div>
          </section>
        )}

        {isChessSearch && (
          <section className="border-b border-border p-4 flex items-center justify-between hover:bg-muted/40">
            <div className="flex items-center gap-4">
              <div className="flex items-center justify-center size-12 rounded bg-muted">
                <HorseIcon size={24} className="text-foreground" />
              </div>
              <div>
                <h3 className="font-semibold">Play chess online</h3>
                <p className="text-sm text-muted-foreground">Challenge friends or find a match.</p>
              </div>
            </div>
            
            <Dialog>
              <Button render={<DialogTrigger />}>Play now</Button>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Challenge to Chess</DialogTitle>
                </DialogHeader>
                <form onSubmit={submitChallenge} className="flex flex-col gap-4 mt-4">
                  <div className="flex flex-col gap-2">
                    <label htmlFor="targetUser" className="text-sm font-medium">Opponent's Handle</label>
                    <Input 
                      id="targetUser"
                      placeholder="@handle" 
                      value={challengeTarget}
                      onChange={(e) => setChallengeTarget(e.target.value)}
                    />
                    {challengeError && <p className="text-xs text-destructive">{challengeError}</p>}
                  </div>
                  <Button type="submit" disabled={!challengeTarget}>Send Challenge</Button>
                </form>
              </DialogContent>
            </Dialog>
          </section>
        )}

        {query.length < 2 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            Enter at least 2 characters. Operators like <code>from:</code>,{" "}
            <code>has:media</code>, and <code>since:</code> are supported.
          </p>
        ) : loading ? (
          <PageLoading label="Searching…" />
        ) : (
          <>
            {users.length > 0 && (
              <section className="border-b border-border">
                <h2 className="px-4 py-2 text-xs font-medium text-muted-foreground">
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
                <h2 className="px-4 py-2 text-xs font-medium text-muted-foreground">
                  Posts
                </h2>
                {posts.map((p) => (
                  <PostCard key={p.id} post={p} />
                ))}
              </section>
            )}
            {users.length === 0 && posts.length === 0 && (
              <PageEmpty
                title="No matches"
                description="Try a different term or a search operator from the help above."
                className="py-8"
              />
            )}
          </>
        )}
      </main>
    </PageFrame>
  )
}
