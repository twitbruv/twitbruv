import { Link } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { Card } from "@workspace/ui/components/card"
import { APP_NAME } from "../lib/env"
import { api } from "../lib/api"
import { qk } from "../lib/query-keys"

export function RightRail() {
  const { data: trending = [], isPending } = useQuery({
    queryKey: qk.trending(),
    queryFn: async () => {
      const { hashtags } = await api.trendingHashtags()
      return hashtags
    },
    staleTime: 5 * 60_000,
  })

  return (
    <aside className="hidden w-[320px] shrink-0 xl:block">
      <div className="sticky top-14 space-y-4 px-4 py-4">
        <Card>
          <Card.Body>
            <h2 className="text-sm font-semibold text-primary">Trending</h2>
            {isPending ? (
              <p className="mt-1 text-xs text-tertiary">loading…</p>
            ) : trending.length === 0 ? (
              <p className="mt-1 text-xs text-tertiary">
                Quiet around here. Be the first to start something.
              </p>
            ) : (
              <ul className="mt-2 space-y-2">
                {trending.map((t) => (
                  <li key={t.tag}>
                    <Link
                      to="/hashtag/$tag"
                      params={{ tag: t.tag }}
                      className="hover:bg-base-2/60 block rounded-md px-2 py-1 text-sm transition"
                    >
                      <div className="font-semibold">#{t.tag}</div>
                      <div className="text-xs text-tertiary">
                        {t.postCount} post{t.postCount === 1 ? "" : "s"}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card.Body>
        </Card>

        <Card>
          <Card.Body>
            <h2 className="text-sm font-semibold text-primary">
              Open for everyone
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-tertiary">
              {APP_NAME} is free, open-source, and has no AI ranking. See{" "}
              <Link to="/search" className="text-primary hover:underline">
                search
              </Link>{" "}
              to find people.
            </p>
          </Card.Body>
        </Card>
      </div>
    </aside>
  )
}
