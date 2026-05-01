import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router"
import { Suspense, lazy, useEffect, useMemo } from "react"
import { SegmentedControl } from "@workspace/ui/components/segmented-control"
import { authClient } from "../lib/auth"
import { useMe } from "../lib/me"
import { usePageHeader } from "../components/app-page-header"
import { PageLoading } from "../components/page-surface"
import { PageFrame } from "../components/page-frame"

const ADMIN_TABS = ["stats", "users", "posts", "reports"] as const
type AdminTab = (typeof ADMIN_TABS)[number]

const TAB_LABELS: Record<AdminTab, string> = {
  stats: "Stats",
  users: "Users",
  posts: "Posts",
  reports: "Reports",
}

const AdminStats = lazy(() => import("../components/admin/stats"))
const AdminUsers = lazy(() => import("../components/admin/users"))
const AdminPosts = lazy(() => import("../components/admin/posts"))
const AdminReports = lazy(() => import("../components/admin/reports"))

export const Route = createFileRoute("/admin")({
  component: AdminLayout,
  validateSearch: (search: Record<string, unknown>): { tab?: AdminTab } => {
    const raw = search.tab
    if (typeof raw === "string" && ADMIN_TABS.includes(raw as AdminTab)) {
      return { tab: raw as AdminTab }
    }
    return {}
  },
})

function AdminLayout() {
  const router = useRouter()
  const navigate = useNavigate()
  const { data: session, isPending } = authClient.useSession()
  const { me } = useMe()
  const { tab: searchTab } = Route.useSearch()
  const tab: AdminTab = searchTab ?? "stats"

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

  return (
    <PageFrame width="full">
      <header className="sticky top-0 z-40 flex h-12 items-center bg-base-1/80 px-4 backdrop-blur-md">
        <SegmentedControl<AdminTab>
          layout="fit"
          variant="ghost"
          value={tab}
          options={ADMIN_TABS.map((t) => ({
            value: t,
            label: TAB_LABELS[t],
          }))}
          onValueChange={(value) => {
            void navigate({
              to: "/admin",
              search: value === "stats" ? undefined : { tab: value },
            })
          }}
        />
      </header>
      <Suspense fallback={<PageLoading className="p-6" label="Loading…" />}>
        {tab === "stats" && <AdminStats />}
        {tab === "users" && <AdminUsers />}
        {tab === "posts" && <AdminPosts />}
        {tab === "reports" && <AdminReports />}
      </Suspense>
    </PageFrame>
  )
}
