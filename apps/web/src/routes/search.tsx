import { Link, createFileRoute } from "@tanstack/react-router"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useMemo, useState } from "react"
import {
  BookmarkIcon,
  MagnifyingGlassIcon,
  SparklesIcon,
  UserPlusIcon,
  XMarkIcon,
} from "@heroicons/react/24/solid"
import { BookmarkIcon as BookmarkIconOutline } from "@heroicons/react/24/outline"
import { Avatar } from "@workspace/ui/components/avatar"
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
import { VerifiedBadge, resolveBadgeTier } from "../components/verified-badge"
import { ApiError, api } from "../lib/api"
import { qk } from "../lib/query-keys"
import { useMe } from "../lib/me"
import type { Post, PublicUser } from "../lib/api"

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
  const qc = useQueryClient()
  const { me } = useMe()
  const [draft, setDraft] = useState(initialQuery)
  const [savedActionError, setSavedActionError] = useState<string | null>(null)

  const query = draft.trim()

  const isChessSearch = query.toLowerCase() === "chess"
  const [challengeTarget, setChallengeTarget] = useState("")
  const [challengeError, setChallengeError] = useState<string | null>(null)

  const { data: saved = [], error: savedErr } = useQuery({
    queryKey: qk.savedSearches(),
    queryFn: async () => (await api.savedSearches()).items,
    enabled: !!me,
  })

  const activeSavedId = saved.find((s) => s.query === query)?.id ?? null

  const savedError =
    savedErr instanceof ApiError
      ? savedErr.message
      : savedErr
        ? "couldn't load saved searches"
        : null

  const { data: searchResult, isFetching: loading } = useQuery({
    queryKey: qk.search(query),
    queryFn: () => api.search(query),
    enabled: query.length >= 2,
  })

  const { data: suggested = [] } = useQuery({
    queryKey: qk.suggestedUsers(),
    queryFn: async () => (await api.suggestedUsers()).users,
    enabled: !!me && query.length < 2,
    staleTime: 5 * 60 * 1000,
  })

  const users: Array<PublicUser> = searchResult?.users ?? []
  const posts: Array<Post> = searchResult?.posts ?? []

  async function submitChallenge(e: React.FormEvent) {
    e.preventDefault()
    setChallengeError(null)
    const targetHandle = challengeTarget.replace(/^@/, "").trim()
    try {
      const { user } = await api.user(targetHandle)
      const { game } = await api.chessCreateGame(user.id)
      navigate({ to: "/chess/$id", params: { id: game.id } })
    } catch (err) {
      setChallengeError("Could not find user or challenge failed.")
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const term = draft.trim()
    if (term.length === 0) return
    navigate({ to: "/search", search: { q: term } })
  }

  const appHeader = useMemo(() => ({ title: "Search" as const }), [])
  usePageHeader(appHeader)

  async function toggleSaved() {
    if (!me) return
    if (query.length < 2) return
    setSavedActionError(null)
    if (activeSavedId) {
      const id = activeSavedId
      try {
        await api.deleteSavedSearch(id)
        await qc.invalidateQueries({ queryKey: qk.savedSearches() })
      } catch {
        await qc.invalidateQueries({ queryKey: qk.savedSearches() })
      }
    } else {
      try {
        await api.saveSearch(query)
        await qc.invalidateQueries({ queryKey: qk.savedSearches() })
      } catch (e) {
        setSavedActionError(
          e instanceof ApiError ? e.message : "couldn't save search"
        )
      }
    }
  }

  return (
    <PageFrame>
      <div className="border-b border-neutral">
        <form onSubmit={onSubmit} className="px-4 py-3">
          <div className="relative">
            <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-tertiary" />
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
                    <BookmarkIcon className="size-3.5" />
                    Saved
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <BookmarkIconOutline className="size-3.5" />
                    Save this search
                  </span>
                )}
              </button>
              <details className="text-tertiary">
                <summary className="cursor-pointer select-none">
                  Operators
                </summary>
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
          {(savedError || savedActionError) && (
            <Alert variant="destructive" className="mt-2 text-left">
              <AlertDescription className="text-xs">
                {savedActionError ?? savedError}
              </AlertDescription>
            </Alert>
          )}
        </form>
      </div>

      {me && saved.length > 0 && (
        <section className="border-b border-neutral px-4 py-2">
          <h2 className="mb-1 text-xs font-medium text-tertiary">
            Saved searches
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {saved.map((s) => (
              <span key={s.id} className="inline-flex items-center gap-0.5">
                <Button
                  size="sm"
                  variant={s.query === query ? "outline" : "transparent"}
                  onClick={() => {
                    setDraft(s.query)
                    navigate({ to: "/search", search: { q: s.query } })
                  }}
                  className="rounded-full"
                >
                  <span className="max-w-[18ch] truncate">{s.query}</span>
                </Button>
                <Button
                  size="sm"
                  variant="transparent"
                  aria-label={`delete saved search ${s.query}`}
                  onClick={async () => {
                    try {
                      await api.deleteSavedSearch(s.id)
                      await qc.invalidateQueries({
                        queryKey: qk.savedSearches(),
                      })
                    } catch {
                      await qc.invalidateQueries({
                        queryKey: qk.savedSearches(),
                      })
                    }
                  }}
                >
                  <XMarkIcon className="size-2.5" />
                </Button>
              </span>
            ))}
          </div>
        </section>
      )}

      {isChessSearch && (
        <section className="flex items-center justify-between border-b border-neutral p-4 hover:bg-base-2/40">
          <div className="flex items-center gap-4">
            <div className="flex size-12 items-center justify-center rounded bg-base-2">
              <SparklesIcon className="text-foreground size-6" />
            </div>
            <div>
              <h3 className="font-semibold">Play chess online</h3>
              <p className="text-sm text-tertiary">
                Challenge friends or find a match.
              </p>
            </div>
          </div>

          <Dialog>
            <Button render={<DialogTrigger />}>Play now</Button>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Challenge to Chess</DialogTitle>
              </DialogHeader>
              <form
                onSubmit={submitChallenge}
                className="mt-4 flex flex-col gap-4"
              >
                <div className="flex flex-col gap-2">
                  <label htmlFor="targetUser" className="text-sm font-medium">
                    Opponent's Handle
                  </label>
                  <Input
                    id="targetUser"
                    placeholder="@handle"
                    value={challengeTarget}
                    onChange={(e) => setChallengeTarget(e.target.value)}
                  />
                  {challengeError && (
                    <p className="text-destructive text-xs">{challengeError}</p>
                  )}
                </div>
                <Button type="submit" disabled={!challengeTarget}>
                  Send Challenge
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </section>
      )}

      {query.length < 2 ? (
        <>
          <p className="px-4 py-4 text-xs text-tertiary">
            Enter at least 2 characters. Operators like <code>from:</code>,{" "}
            <code>has:media</code>, and <code>since:</code> are supported.
          </p>
          {me && suggested.length > 0 && (
            <section>
              <h2 className="flex items-center gap-1.5 border-t border-neutral px-4 py-2 text-xs font-medium text-tertiary">
                <UserPlusIcon className="size-3.5" />
                Suggested for you
              </h2>
              {suggested.map((u) =>
                u.handle ? (
                  <Link
                    key={u.id}
                    to="/$handle"
                    params={{ handle: u.handle }}
                    className="flex items-start gap-3 border-t border-neutral px-4 py-3 hover:bg-base-2/40"
                  >
                    <Avatar
                      src={u.avatarUrl}
                      initial={(u.displayName || u.handle).slice(0, 2)}
                      size="lg"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1 text-sm font-medium">
                        <span className="truncate">
                          {u.displayName || `@${u.handle}`}
                        </span>
                        {(() => {
                          const tier = resolveBadgeTier(u)
                          return tier ? (
                            <VerifiedBadge size={14} role={tier} />
                          ) : null
                        })()}
                      </div>
                      <div className="text-xs text-tertiary">@{u.handle}</div>
                      {u.bio && (
                        <p className="mt-1 line-clamp-2 text-xs text-tertiary">
                          {u.bio}
                        </p>
                      )}
                    </div>
                  </Link>
                ) : null
              )}
            </section>
          )}
        </>
      ) : loading ? (
        <PageLoading label="Searching…" />
      ) : (
        <>
          {users.length > 0 && (
            <section className="border-b border-neutral">
              <h2 className="px-4 py-2 text-xs font-medium text-tertiary">
                People
              </h2>
              {users.map((u) =>
                u.handle ? (
                  <Link
                    key={u.id}
                    to="/$handle"
                    params={{ handle: u.handle }}
                    className="block border-t border-neutral px-4 py-3 hover:bg-base-2/40"
                  >
                    <div className="flex items-center gap-1 text-sm font-medium">
                      <span className="truncate">
                        {u.displayName || `@${u.handle}`}
                      </span>
                      {(() => {
                        const tier = resolveBadgeTier(u)
                        return tier ? (
                          <VerifiedBadge size={14} role={tier} />
                        ) : null
                      })()}
                    </div>
                    <div className="text-xs text-tertiary">@{u.handle}</div>
                    {u.bio && (
                      <p className="mt-1 line-clamp-2 text-xs text-tertiary">
                        {u.bio}
                      </p>
                    )}
                  </Link>
                ) : null
              )}
            </section>
          )}
          {posts.length > 0 && (
            <section>
              <h2 className="px-4 py-2 text-xs font-medium text-tertiary">
                Posts
              </h2>
              {posts.map((p) => (
                <PostCard key={p.id} post={p} />
              ))}
            </section>
          )}
          {users.length === 0 && posts.length === 0 && (
            <PageEmpty
              icon={<MagnifyingGlassIcon />}
              title="No matches"
              description="Try a different term, or use a search operator like from: or has:media."
              className="py-8"
            />
          )}
        </>
      )}
    </PageFrame>
  )
}
