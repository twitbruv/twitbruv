export interface RouteInfo {
  title: string
  sub?: string
  back?: boolean
}

export function getRouteInfo(pathname: string): RouteInfo {
  if (pathname === "/") return { title: "Home", sub: "for you" }
  if (pathname === "/search") return { title: "Search" }
  if (pathname === "/notifications") return { title: "Notifications" }
  if (pathname === "/inbox") return { title: "Messages" }
  if (pathname.startsWith("/inbox/")) return { title: "Message", back: true }
  if (pathname === "/bookmarks") return { title: "Bookmarks" }
  if (pathname.startsWith("/articles/new"))
    return { title: "New Article", back: true }
  if (pathname === "/settings") return { title: "Settings", back: true }
  if (pathname === "/analytics") return { title: "Analytics", back: true }
  if (pathname.startsWith("/admin")) return { title: "Admin", back: true }
  if (pathname.startsWith("/hashtag/")) return { title: "Hashtag", back: true }
  // Dynamic routes: /$handle/p/$id, /$handle/a/$slug, /$handle
  if (pathname.match(/^\/[^/]+\/p\/[^/]+$/))
    return { title: "Post", back: true }
  if (pathname.match(/^\/[^/]+\/a\/[^/]+$/))
    return { title: "Article", back: true }
  if (pathname.match(/^\/[^/]+\/followers$/))
    return { title: "Followers", back: true }
  if (pathname.match(/^\/[^/]+\/following$/))
    return { title: "Following", back: true }
  if (
    pathname.match(/^\/[^/]+$/) &&
    !pathname.startsWith("/login") &&
    !pathname.startsWith("/signup")
  ) {
    return { title: "Profile", back: true }
  }
  return { title: "Home" }
}
