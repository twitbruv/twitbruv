import {
  Outlet,
  createFileRoute,
  useRouter,
  useRouterState,
} from "@tanstack/react-router"
import { useEffect, useMemo } from "react"
import { authClient } from "../lib/auth"
import { useMe } from "../lib/me"
import { usePageHeader } from "../components/app-page-header"
import { PageLoading } from "../components/page-surface"
import {
  UnderlineTabLink,
  UnderlineTabRow,
} from "../components/underline-tab-row"

export const Route = createFileRoute("/admin")({ component: AdminLayout })

function AdminLayout() {
  const router = useRouter()
  const { data: session, isPending } = authClient.useSession()
  const { me } = useMe()
  const path = useRouterState({ select: (s) => s.location.pathname })

  useEffect(() => {
    if (isPending) return
    if (!session) {
      router.navigate({ to: "/login" })
      return
    }
    if (me && me.role !== "admin" && me.role !== "owner") {
      router.navigate({ to: "/" })
    }
  }, [isPending, session, me, router])

  const appHeader = useMemo(() => {
    if (!session || !me || (me.role !== "admin" && me.role !== "owner")) {
      return null
    }
    return {
      title: "Admin" as const,
      action: <span className="text-xs text-muted-foreground">{me.role}</span>,
    }
  }, [session, me])
  usePageHeader(appHeader)

  if (!session || !me || (me.role !== "admin" && me.role !== "owner")) {
    return <PageLoading className="p-6" label="Loading…" />
  }

  return (
    <div className="mx-auto flex h-[calc(100svh-3rem)] w-full max-w-7xl flex-col overflow-hidden border-x border-b">
      <header className="shrink-0 border-b border-border bg-background/80 px-4 py-3 backdrop-blur-sm">
        <UnderlineTabRow>
          <UnderlineTabLink
            to="/admin/stats"
            active={path.startsWith("/admin/stats")}
          >
            Stats
          </UnderlineTabLink>
          <UnderlineTabLink
            to="/admin/users"
            active={path.startsWith("/admin/users")}
          >
            Users
          </UnderlineTabLink>
          <UnderlineTabLink
            to="/admin/posts"
            active={path.startsWith("/admin/posts")}
          >
            Posts
          </UnderlineTabLink>
          <UnderlineTabLink
            to="/admin/reports"
            active={path.startsWith("/admin/reports")}
          >
            Reports
          </UnderlineTabLink>
        </UnderlineTabRow>
      </header>
      <Outlet />
    </div>
  )
}
