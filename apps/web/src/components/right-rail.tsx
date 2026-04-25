import { Link } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { APP_NAME } from "../lib/env"
import { api } from "../lib/api"

export function RightRail() {
  const [trending, setTrending] = useState<Array<{
    tag: string
    postCount: number
  }> | null>(null)

  useEffect(() => {
    let cancel = false
    api
      .trendingHashtags()
      .then(({ hashtags }) => {
        if (!cancel) setTrending(hashtags)
      })
      .catch(() => {
        if (!cancel) setTrending([])
      })
    return () => {
      cancel = true
    }
  }, [])

  return (
    <aside className="hidden w-[320px] shrink-0 xl:block">
      <div className="sticky top-14 space-y-4 px-4 py-4">
        <section className="rounded-xl border border-border bg-card/40 p-4">
          <h2 className="text-sm font-semibold">Trending</h2>
          {trending === null ? (
            <p className="mt-1 text-xs text-muted-foreground">loading…</p>
          ) : trending.length === 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Quiet around here. Be the first to start something.
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {trending.map((t) => (
                <li key={t.tag}>
                  <Link
                    to="/hashtag/$tag"
                    params={{ tag: t.tag }}
                    className="block rounded-md px-2 py-1 text-sm transition hover:bg-muted/40"
                  >
                    <div className="font-semibold">#{t.tag}</div>
                    <div className="text-xs text-muted-foreground">
                      {t.postCount} post{t.postCount === 1 ? "" : "s"}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-border bg-card/40 p-4">
          <h2 className="text-sm font-semibold">Open for everyone</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {APP_NAME} is free, open-source, and has no AI ranking. See{" "}
            <Link to="/search" className="text-primary hover:underline">
              search
            </Link>{" "}
            to find people.
          </p>
        </section>
      </div>
    </aside>
  )
}
