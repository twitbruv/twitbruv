import { createFileRoute, useRouter } from "@tanstack/react-router"
import { useCallback, useEffect } from "react"
import { api } from "../lib/api"
import { authClient } from "../lib/auth"
import { Feed } from "../components/feed"
import { PageFrame } from "../components/page-frame"

export const Route = createFileRoute("/bookmarks")({ component: Bookmarks })

function Bookmarks() {
  const { data: session, isPending } = authClient.useSession()
  const router = useRouter()
  useEffect(() => {
    if (!isPending && !session) router.navigate({ to: "/login" })
  }, [isPending, session, router])

  const load = useCallback((cursor?: string) => api.bookmarks(cursor), [])

  return (
    <PageFrame>
      <main className="">
        <header className="border-b border-border px-4 py-3">
          <h1 className="text-base font-semibold">Bookmarks</h1>
          <p className="text-xs text-muted-foreground">
            only you can see this list.
          </p>
        </header>
        <Feed
          queryKey={["bookmarks"]}
          load={load}
          emptyMessage="no bookmarks yet. tap the bookmark icon on a post to save it."
        />
      </main>
    </PageFrame>
  )
}
