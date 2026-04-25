import { createFileRoute } from "@tanstack/react-router"
import { useCallback } from "react"
import { api } from "../lib/api"
import { Feed } from "../components/feed"
import { PageFrame } from "../components/page-frame"

export const Route = createFileRoute("/hashtag/$tag")({
  component: HashtagPage,
})

function HashtagPage() {
  const { tag } = Route.useParams()
  const load = useCallback((cursor?: string) => api.hashtag(tag, cursor), [tag])

  return (
    <PageFrame>
      <main className="">
        <header className="border-b border-border px-4 py-3">
          <h1 className="text-lg font-semibold">#{tag}</h1>
          <p className="text-xs text-muted-foreground">
            public posts with this hashtag
          </p>
        </header>
        <Feed
          queryKey={["hashtag", tag]}
          load={load}
          emptyMessage={`Nothing tagged #${tag} yet.`}
        />
      </main>
    </PageFrame>
  )
}
