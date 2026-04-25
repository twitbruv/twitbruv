import { Link, createFileRoute } from "@tanstack/react-router"
import { useCallback } from "react"
import { api } from "../lib/api"
import { UserList } from "../components/user-list"

export const Route = createFileRoute("/$handle/followers")({
  component: Followers,
})

function Followers() {
  const { handle } = Route.useParams()
  const load = useCallback(
    (cursor?: string) => api.followers(handle, cursor),
    [handle]
  )
  return (
    <main className="">
      <header className="border-b border-border px-4 py-3 text-sm">
        <Link
          to="/$handle"
          params={{ handle }}
          className="text-muted-foreground hover:underline"
        >
          ← @{handle}
        </Link>
        <h1 className="mt-1 font-semibold">Followers</h1>
      </header>
      <UserList load={load} emptyMessage="No followers yet." />
    </main>
  )
}
