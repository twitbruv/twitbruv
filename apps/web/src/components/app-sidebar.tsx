import { useMemo } from "react"
import { Link, useNavigate } from "@tanstack/react-router"
import {
  BellIcon,
  BookmarkIcon,
  ChartBarIcon,
  ClockIcon,
  EnvelopeIcon,
  HomeIcon,
  ListBulletIcon,
  MagnifyingGlassIcon,
  ShieldCheckIcon,
  UserIcon,
} from "@heroicons/react/24/outline"
import {
  BellIcon as BellIconSolid,
  BookmarkIcon as BookmarkIconSolid,
  ChartBarIcon as ChartBarIconSolid,
  ClockIcon as ClockIconSolid,
  EnvelopeIcon as EnvelopeIconSolid,
  HomeIcon as HomeIconSolid,
  ListBulletIcon as ListBulletIconSolid,
  MagnifyingGlassIcon as MagnifyingGlassIconSolid,
  ShieldCheckIcon as ShieldCheckIconSolid,
  UserIcon as UserIconSolid,
} from "@heroicons/react/24/solid"
import { Sidebar } from "@workspace/ui/components/sidebar"
import { cn } from "@workspace/ui/lib/utils"
import { useTheme } from "../lib/theme"
import { useMe } from "../lib/me"
import { authClient } from "../lib/auth"
import {
  useUnreadDms,
  useUnreadNotifications,
} from "../hooks/use-app-nav-badges"
import { useSettings } from "./settings/settings-provider"
import type { SidebarNavItem } from "@workspace/ui/components/sidebar"

const navItems: Array<SidebarNavItem> = [
  {
    to: "/",
    label: "Home",
    icon: HomeIcon,
    iconActive: HomeIconSolid,
    end: true,
  },
  {
    to: "/search",
    label: "Search",
    icon: MagnifyingGlassIcon,
    iconActive: MagnifyingGlassIconSolid,
  },
  {
    to: "/notifications",
    label: "Notifications",
    icon: BellIcon,
    iconActive: BellIconSolid,
  },
  {
    to: "/inbox",
    label: "Messages",
    icon: EnvelopeIcon,
    iconActive: EnvelopeIconSolid,
  },
  {
    to: "/analytics",
    label: "Analytics",
    icon: ChartBarIcon,
    iconActive: ChartBarIconSolid,
  },
  {
    to: "/bookmarks",
    label: "Bookmarks",
    icon: BookmarkIcon,
    iconActive: BookmarkIconSolid,
  },
  {
    to: "/lists",
    label: "Lists",
    icon: ListBulletIcon,
    iconActive: ListBulletIconSolid,
  },
  {
    to: "/drafts",
    label: "Drafts",
    icon: ClockIcon,
    iconActive: ClockIconSolid,
  },
]

const profileItem: SidebarNavItem = {
  to: "/$handle",
  label: "Profile",
  icon: UserIcon,
  iconActive: UserIconSolid,
}

const adminItem: SidebarNavItem = {
  to: "/admin",
  label: "Admin",
  icon: ShieldCheckIcon,
  iconActive: ShieldCheckIconSolid,
}

export function AppSidebar({
  onCompose,
  compact,
}: {
  onCompose: () => void
  compact?: boolean
}) {
  const { me } = useMe()
  const { theme, setTheme } = useTheme()
  const navigate = useNavigate()
  const { open: openSettings } = useSettings()
  const unreadNotifications = useUnreadNotifications(!!me)
  const unreadDms = useUnreadDms(!!me)

  const items = useMemo(() => {
    if (!me) return []
    const merged = navItems.map((item) => {
      if (item.to === "/notifications") {
        return { ...item, badge: unreadNotifications }
      }
      if (item.to === "/inbox") {
        return { ...item, badge: unreadDms }
      }
      return item
    })
    return [
      ...merged,
      { ...profileItem, to: `/${me.handle}` },
      ...(me.role === "admin" || me.role === "owner" ? [adminItem] : []),
    ]
  }, [me, unreadDms, unreadNotifications])

  // While loading or not authed, render the sidebar shell (just the logo) so the layout doesn't shift
  if (!me) {
    return (
      <aside
        className={cn(
          "sticky top-0 flex h-svh w-[68px] shrink-0 flex-col items-center py-4",
          !compact && "xl:w-[240px] xl:items-start xl:px-3"
        )}
      >
        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center text-primary",
            !compact && "xl:ml-1"
          )}
        >
          <svg className="size-6" viewBox="0 0 193 257" fill="none">
            <path
              d="M127.502 50.3154C127.502 57.7961 121.438 63.8604 113.957 63.8604H78.2862C70.8055 63.8604 64.7412 57.7961 64.7412 50.3154V13.545C64.7412 6.06429 58.6769 0 51.1962 0H13.545C6.06429 0 0 6.06429 0 13.545V51.1962C0 58.6769 6.06429 64.7412 13.545 64.7412H50.0966C57.5773 64.7412 63.6416 70.8055 63.6416 78.2862V113.929C63.6416 121.409 57.5773 127.474 50.0966 127.474H13.545C6.06429 127.474 0 133.538 0 141.019V178.67C0 186.151 6.06429 192.215 13.545 192.215H51.1953C58.6759 192.215 64.7402 198.279 64.7402 205.76V243.411C64.7402 250.892 70.8045 256.956 78.2852 256.956H115.936C123.417 256.956 129.481 250.892 129.481 243.411V207.378C129.481 199.897 135.546 193.833 143.026 193.833H179.059C186.539 193.833 192.604 187.769 192.604 180.288V142.638C192.604 135.157 186.539 129.093 179.059 129.093H141.408C133.928 129.093 127.863 135.157 127.863 142.638V178.67C127.863 186.151 121.799 192.215 114.318 192.215H78.2862C70.8055 192.215 64.7412 186.151 64.7412 178.67V142.147C64.7412 134.666 70.8055 128.602 78.2862 128.602H114.838C122.319 128.602 128.383 122.537 128.383 115.057V78.2862C128.383 70.8055 134.447 64.7412 141.928 64.7412H178.698C186.179 64.7412 192.243 58.6769 192.243 51.1962V13.545C192.243 6.06429 186.179 0 178.698 0H141.047C133.566 0 127.502 6.06429 127.502 13.545V50.3154Z"
              fill="currentColor"
            />
          </svg>
        </div>
      </aside>
    )
  }

  return (
    <Sidebar
      compact={compact}
      navItems={items}
      renderLink={({ to, end, className, children }) => (
        <Link to={to} activeOptions={{ exact: end, includeSearch: false }}>
          {({ isActive }) => (
            <div className={className(isActive)}>{children(isActive)}</div>
          )}
        </Link>
      )}
      user={{
        displayName: me.displayName ?? me.handle ?? "User",
        handle: me.handle ?? "",
        avatarUrl: me.avatarUrl,
      }}
      theme={theme}
      onThemeChange={setTheme}
      onCompose={onCompose}
      onSettings={() => openSettings()}
      onSignOut={() => {
        authClient.signOut()
        navigate({ to: "/login" })
      }}
    />
  )
}
