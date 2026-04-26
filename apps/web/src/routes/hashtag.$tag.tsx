import { createFileRoute } from "@tanstack/react-router"
import { useCallback, useMemo } from "react"
import { api } from "../lib/api"
import { usePageHeader } from "../components/app-page-header"
import { Feed } from "../components/feed"
import { PageFrame } from "../components/page-frame"
import { APP_NAME } from "../lib/env"
import { buildSeoMeta, canonicalLink } from "../lib/seo"
import type { AppPageHeaderSpec } from "../components/app-page-header"

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

  const appHeader = useMemo<AppPageHeaderSpec>(
    () => ({
      plainTitle: true,
      title: (
        <div className="flex w-full min-w-0 flex-col">
          <h1 className="truncate text-base font-semibold leading-tight text-foreground">
            #{tag}
          </h1>
          <p className="text-xs text-muted-foreground">
            public posts with this hashtag
          </p>
        </div>
      ),
    }),
    [tag]
  )
  usePageHeader(appHeader)

  return (
    <PageFrame>
      <main>
        <Feed
          queryKey={["hashtag", tag]}
          load={load}
          emptyMessage={`Nothing tagged #${tag} yet.`}
        />
      </main>
    </PageFrame>
  )
}
