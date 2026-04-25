import { createFileRoute } from "@tanstack/react-router"
import { useCallback } from "react"
import { api } from "../lib/api"
import { Feed } from "../components/feed"
import { PageFrame } from "../components/page-frame"
import { APP_NAME } from "../lib/env"
import { buildSeoMeta, canonicalLink } from "../lib/seo"

export const Route = createFileRoute("/hashtag/$tag")({
  component: HashtagPage,
  head: ({ params }) => {
    const tag = params.tag.replace(/^#/, "")
    const path = `/hashtag/${tag}`
    return {
      meta: buildSeoMeta({
        title: `#${tag}`,
        description: `Public posts tagged #${tag} on ${APP_NAME}.`,
        path,
      }),
      links: [canonicalLink(path)],
    }
  },
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
