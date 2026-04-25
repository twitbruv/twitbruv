import { useLocation, useRouter } from "@tanstack/react-router"
import { IconArrowLeft } from "@tabler/icons-react"

export function AppHeader() {
  const location = useLocation()
  const router = useRouter()
  const { title, sub, back } = getRouteInfo(location.pathname)

  return (
    <header className="sticky top-0 z-10 flex justify-center border-b border-border bg-background/90 backdrop-blur-sm">
      <div className="flex w-full max-w-[620px] items-center gap-2.5 px-4 py-2.5">
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
        <div className="flex-1" />
        <kbd className="hidden items-center gap-1 rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline-flex">
          <span>⌘</span>K
        </kbd>
      </div>
    </header>
  )
}

function getRouteInfo(pathname: string): { title: string; sub?: string; back?: boolean } {
  if (pathname === "/") return { title: "Home", sub: "for you" }
  if (pathname === "/search") return { title: "Search" }
  if (pathname === "/notifications") return { title: "Notifications" }
  if (pathname === "/inbox") return { title: "Messages" }
  if (pathname.startsWith("/inbox/")) return { title: "Message", back: true }
  if (pathname === "/bookmarks") return { title: "Bookmarks" }
  if (pathname.startsWith("/articles/new")) return { title: "New Article", back: true }
  if (pathname === "/settings") return { title: "Settings", back: true }
  if (pathname === "/analytics") return { title: "Analytics", back: true }
  if (pathname.startsWith("/admin")) return { title: "Admin", back: true }
  if (pathname.startsWith("/hashtag/")) return { title: "Hashtag", back: true }
  // Dynamic routes: /$handle/p/$id, /$handle/a/$slug, /$handle
  if (pathname.match(/^\/[^/]+\/p\/[^/]+$/)) return { title: "Post", back: true }
  if (pathname.match(/^\/[^/]+\/a\/[^/]+$/)) return { title: "Article", back: true }
  if (pathname.match(/^\/[^/]+\/followers$/)) return { title: "Followers", back: true }
  if (pathname.match(/^\/[^/]+\/following$/)) return { title: "Following", back: true }
  if (pathname.match(/^\/[^/]+$/) && !pathname.startsWith("/login") && !pathname.startsWith("/signup")) {
    return { title: "Profile", back: true }
  }
  return { title: "Home" }
}
