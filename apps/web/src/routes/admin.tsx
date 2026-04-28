import {
  Outlet,
  createFileRoute,
  useRouter,
  useRouterState,
} from "@tanstack/react-router"
import { useEffect, useMemo } from "react"
import { SegmentedControl } from "@workspace/ui/components/segmented-control"
import { authClient } from "../lib/auth"
import { useMe } from "../lib/me"
import { usePageHeader } from "../components/app-page-header"
import { PageLoading } from "../components/page-surface"

export const Route = createFileRoute("/admin")({ component: AdminLayout })

type AdminTab = "stats" | "users" | "posts" | "reports"

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
      action: <span className="text-muted-foreground text-xs">{me.role}</span>,
    }
  }, [session, me])
  usePageHeader(appHeader)

  if (!session || !me || (me.role !== "admin" && me.role !== "owner")) {
    return <PageLoading className="p-6" label="Loading…" />
  }

  const activeTab: AdminTab = path.startsWith("/admin/users")
    ? "users"
    : path.startsWith("/admin/posts")
      ? "posts"
      : path.startsWith("/admin/reports")
        ? "reports"
        : "stats"

  return (
    <div className="mx-auto flex h-[calc(100svh-3rem)] w-full max-w-7xl flex-col overflow-hidden border-x border-b">
      <header className="border-border bg-background/80 shrink-0 border-b px-4 py-3 backdrop-blur-sm">
        <SegmentedControl<AdminTab>
          layout="fit"
          variant="ghost"
          value={activeTab}
          options={[
            { value: "stats", label: "Stats" },
            { value: "users", label: "Users" },
            { value: "posts", label: "Posts" },
            { value: "reports", label: "Reports" },
          ]}
          onValueChange={(value) => {
            const to =
              value === "stats"
                ? "/admin/stats"
                : value === "users"
                  ? "/admin/users"
                  : value === "posts"
                    ? "/admin/posts"
                    : "/admin/reports"
            void router.navigate({ to })
          }}
        />
      </header>
      <Outlet />
    </div>
  )
}
