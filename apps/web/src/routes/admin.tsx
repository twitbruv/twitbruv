import {
  Link,
  Outlet,
  createFileRoute,
  useRouter,
} from "@tanstack/react-router"
import { useEffect } from "react"
import { authClient } from "../lib/auth"
import { useMe } from "../lib/me"

export const Route = createFileRoute("/admin")({ component: AdminLayout })

function AdminLayout() {
  const router = useRouter()
  const { data: session, isPending } = authClient.useSession()
  const { me } = useMe()

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

  if (!session || !me || (me.role !== "admin" && me.role !== "owner")) {
    return <p className="p-6 text-sm text-muted-foreground">checking…</p>
  }

  return (
    <div>
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 px-4 py-3 backdrop-blur-sm">
        <div className="flex items-baseline justify-between">
          <h1 className="text-base font-semibold">Admin</h1>
          <span className="text-xs tracking-wider text-muted-foreground uppercase">
            {me.role}
          </span>
        </div>
        <nav className="mt-2 flex gap-4 text-sm">
          <Link
            to="/admin/users"
            activeProps={{ className: "font-semibold underline" }}
            className="text-muted-foreground hover:text-foreground"
          >
            Users
          </Link>
          <Link
            to="/admin/reports"
            activeProps={{ className: "font-semibold underline" }}
            className="text-muted-foreground hover:text-foreground"
          >
            Reports
          </Link>
        </nav>
      </header>
      <Outlet />
    </div>
  )
}
