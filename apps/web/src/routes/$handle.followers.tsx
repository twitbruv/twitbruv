import { Link, createFileRoute } from "@tanstack/react-router"
import { useCallback, useMemo } from "react"
import { Button } from "@workspace/ui/components/button"
import { api } from "../lib/api"
import { qk } from "../lib/query-keys"
import { PageHeader } from "../components/page-surface"
import { UserList } from "../components/user-list"

export const Route = createFileRoute("/$handle/followers")({
  component: Followers,
})

function Followers() {
  const { handle } = Route.useParams()
  const listKey = useMemo(() => qk.userFollowers(handle), [handle])
  const load = useCallback(
    (cursor?: string) => api.followers(handle, cursor),
    [handle]
  )

  return (
    <section className="min-h-0">
      <PageHeader
        title="Followers"
        description={`People following @${handle}`}
        sticky
        action={
          <Button
            size="sm"
            variant="transparent"
            nativeButton={false}
            render={<Link to="/$handle" params={{ handle }} />}
          >
            Back
          </Button>
        }
      />
      <UserList
        queryKey={listKey}
        load={load}
        emptyTitle="No followers yet"
        emptyMessage={`When someone follows @${handle}, they'll show up here.`}
      />
    </section>
  )
}
