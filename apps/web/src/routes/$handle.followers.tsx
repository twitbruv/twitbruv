import { Link, createFileRoute } from "@tanstack/react-router"
import { useCallback, useMemo } from "react"
import { api } from "../lib/api"
import { usePageHeader } from "../components/app-page-header"
import { PageFrame } from "../components/page-frame"
import { UserList } from "../components/user-list"
import type { AppPageHeaderSpec } from "../components/app-page-header"

export const Route = createFileRoute("/$handle/followers")({
  component: Followers,
})

function Followers() {
  const { handle } = Route.useParams()
  const load = useCallback(
    (cursor?: string) => api.followers(handle, cursor),
    [handle]
  )

  const appHeader = useMemo<AppPageHeaderSpec>(
    () => ({
      plainTitle: true,
      title: (
        <div className="flex w-full min-w-0 items-center gap-2">
          <Link
            to="/$handle"
            params={{ handle }}
            className="shrink-0 text-xs text-muted-foreground hover:underline"
          >
            ← @{handle}
          </Link>
          <h1 className="truncate text-base leading-tight font-semibold text-foreground">
            Followers
          </h1>
        </div>
      ),
    }),
    [handle]
  )
  usePageHeader(appHeader)

  return (
    <PageFrame>
      <main>
        <UserList load={load} emptyMessage="No followers yet." />
      </main>
    </PageFrame>
  )
}
