import { useLocation, useRouter } from "@tanstack/react-router"
import { IconArrowLeft } from "@tabler/icons-react"
import { SidebarTrigger } from "@workspace/ui/components/sidebar"
import { getRouteInfo } from "../lib/routes"

export function AppHeader() {
  const location = useLocation()
  const router = useRouter()
  const { title, sub, back } = getRouteInfo(location.pathname)

  return (
    <header className="sticky top-0 z-10 flex justify-center border-b border-border bg-background/90 backdrop-blur-sm">
      <div className="flex w-full max-w-[620px] items-center gap-2.5 px-4 py-2.5">
        <SidebarTrigger className="size-6" />
        {back && (
          <button
            type="button"
            onClick={() => router.history.back()}
            className="flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <IconArrowLeft size={14} stroke={1.8} />
          </button>
        )}
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {title}
        </span>
        {sub && (
          <>
            <span className="text-muted-foreground/50">·</span>
            <span className="text-xs text-muted-foreground">{sub}</span>
          </>
        )}
      </div>
    </header>
  )
}
