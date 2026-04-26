import { createFileRoute, useRouter } from "@tanstack/react-router"
import { useCallback, useEffect, useMemo } from "react"
import { api } from "../lib/api"
import { authClient } from "../lib/auth"
import { usePageHeader } from "../components/app-page-header"
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

  const appHeader = useMemo(
    () => ({
      title: "Bookmarks" as const,
    }),
    []
  )
  usePageHeader(appHeader)

  return (
    <PageFrame>
      <main className="">
        <Feed
          queryKey={["bookmarks"]}
          load={load}
          emptyMessage="no bookmarks yet. tap the bookmark icon on a post to save it."
        />
      </main>
    </PageFrame>
  )
}
