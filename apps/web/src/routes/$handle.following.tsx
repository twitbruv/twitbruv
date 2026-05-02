import { Link, createFileRoute } from "@tanstack/react-router"
import { useCallback, useMemo } from "react"
import { Button } from "@workspace/ui/components/button"
import { api } from "../lib/api"
import { qk } from "../lib/query-keys"
import { PageHeader } from "../components/page-surface"
import { UserList } from "../components/user-list"

export const Route = createFileRoute("/$handle/following")({
  component: Following,
})

function Following() {
  const { handle } = Route.useParams()
  const listKey = useMemo(() => qk.userFollowing(handle), [handle])
  const load = useCallback(
    (cursor?: string) => api.following(handle, cursor),
    [handle]
  )

  return (
    <section className="min-h-0">
      <PageHeader
        title="Following"
        description={`People @${handle} follows`}
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
        emptyTitle={`@${handle} isn't following anyone yet`}
        emptyMessage="Once they follow people, you'll see them here."
      />
    </section>
  )
}
