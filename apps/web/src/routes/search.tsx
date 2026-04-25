import { Link, createFileRoute } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { IconSearch } from "@tabler/icons-react"
import { Input } from "@workspace/ui/components/input"
import { PageFrame } from "../components/page-frame"
import { PostCard } from "../components/post-card"
import { VerifiedBadge } from "../components/verified-badge"
import { api } from "../lib/api"
import type { Post, PublicUser } from "../lib/api"

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
  const [draft, setDraft] = useState(() =>
    typeof urlQ === "string" ? urlQ : ""
  )
  const [users, setUsers] = useState<Array<PublicUser>>([])
  const [posts, setPosts] = useState<Array<Post>>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setDraft(typeof urlQ === "string" ? urlQ : "")
  }, [urlQ])

  const query = draft.trim()

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

  return (
    <PageFrame>
      <main className="">
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
              placeholder="search people and posts…"
              className="pl-7"
              aria-label="search"
            />
          </form>
        </header>

        {query.length < 2 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            enter at least 2 characters to search people and posts.
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
                        {u.isVerified && <VerifiedBadge size={14} />}
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
                  ) : null
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
