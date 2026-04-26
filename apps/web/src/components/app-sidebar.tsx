import { Link } from "@tanstack/react-router"
import {
  BellIcon,
  BookmarkIcon,
  ChartBarIcon,
  ClockIcon,
  EnvelopeIcon,
  HouseIcon,
  ListIcon,
  MagnifyingGlassIcon,
  PencilIcon,
  ShieldIcon,
  UserIcon,
} from "@phosphor-icons/react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@workspace/ui/components/sidebar"
import { Badge } from "@workspace/ui/components/badge"
import { useEffect, useState } from "react"
import { api } from "../lib/api"
import { APP_NAME } from "../lib/env"
import { subscribeToDmStream } from "../lib/dm-stream"
import { useMe } from "../lib/me"
import { UserNav } from "./user-nav"

const NAV_ITEMS = [
  { to: "/", label: "Home", tooltip: "home", icon: HouseIcon },
  {
    to: "/search",
    label: "Search",
    tooltip: "search",
    icon: MagnifyingGlassIcon,
  },
  {
    to: "/notifications",
    label: "Notifications",
    tooltip: "notifications",
    icon: BellIcon,
    badge: "notifications",
  },
  {
    to: "/inbox",
    label: "Messages",
    tooltip: "messages",
    icon: EnvelopeIcon,
    badge: "messages",
  },
  {
    to: "/analytics",
    label: "Analytics",
    tooltip: "analytics",
    icon: ChartBarIcon,
  },
  {
    to: "/bookmarks",
    label: "Bookmarks",
    tooltip: "bookmarks",
    icon: BookmarkIcon,
  },
  { to: "/lists", label: "Lists", tooltip: "lists", icon: ListIcon },
  { to: "/drafts", label: "Drafts", tooltip: "drafts", icon: ClockIcon },
  {
    to: "/articles/new",
    label: "Write Article",
    tooltip: "write article",
    icon: PencilIcon,
  },
  {
    to: "/$handle",
    label: "Profile",
    tooltip: "profile",
    icon: UserIcon,
    kind: "profile",
  },
] as const

export function AppSidebar({ enabled }: { enabled: boolean }) {
  const { me } = useMe()
  const unread = useUnreadNotifications(enabled)
  const dmUnread = useUnreadDms(enabled)

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-2">
        <Link
          to="/"
          aria-label={APP_NAME}
          className="flex items-center gap-2"
        >
          <div
            aria-hidden="true"
            className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground"
          >
            {APP_NAME.slice(0, 1).toLowerCase()}
          </div>
          <span className="text-base font-semibold group-data-[collapsible=icon]:hidden">
            {APP_NAME}
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => {
                if ("kind" in item) {
                  if (!me?.handle) return null
                  return (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton
                        size="default"
                        tooltip={item.tooltip}
                        render={
                          <Link
                            to="/$handle"
                            params={{ handle: me.handle }}
                          >
                            <item.icon />
                            <span>{item.label}</span>
                          </Link>
                        }
                      />
                    </SidebarMenuItem>
                  )
                }

                const count = !("badge" in item)
                  ? 0
                  : item.badge === "notifications"
                    ? unread
                    : dmUnread
                return (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton
                      size="default"
                      tooltip={item.tooltip}
                      render={
                        <Link to={item.to}>
                          <item.icon />
                          <span>{item.label}</span>
                          {count > 0 && (
                            <Badge
                              className="ml-auto min-w-5 tabular-nums group-data-[collapsible=icon]:hidden"
                              variant="default"
                            >
                              {count > 99 ? "99+" : count}
                            </Badge>
                          )}
                        </Link>
                      }
                    />
                  </SidebarMenuItem>
                )
              })}
              {(me?.role === "admin" || me?.role === "owner") && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    size="default"
                    tooltip="admin"
                    render={
                      <Link to="/admin">
                        <ShieldIcon />
                        <span>Admin</span>
                      </Link>
                    }
                  />
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        {me && (
          <SidebarMenu>
            <SidebarMenuItem>
              <UserNav user={me} />
            </SidebarMenuItem>
          </SidebarMenu>
        )}
      </SidebarFooter>
    </Sidebar>
  )
}

function useUnreadNotifications(enabled: boolean) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (!enabled) {
      setCount(0)
      return
    }
    let cancel = false
    let latest = 0
    async function tick() {
      const requestId = ++latest
      try {
        const { count: next } = await api.notificationsUnreadCount()
        if (!cancel && requestId === latest) setCount(next)
      } catch {}
    }
    tick()
    const iv = setInterval(tick, 60_000)
    return () => {
      cancel = true
      clearInterval(iv)
    }
  }, [enabled])
  return count
}

function useUnreadDms(enabled: boolean) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (!enabled) {
      setCount(0)
      return
    }
    let cancel = false
    let latest = 0
    async function refresh() {
      const requestId = ++latest
      try {
        const { count: next } = await api.dmUnreadCount()
        if (!cancel && requestId === latest) setCount(next)
      } catch {}
    }
    refresh()
    const iv = setInterval(refresh, 120_000)
    const unsubscribe = subscribeToDmStream(() => {
      refresh()
    })
    return () => {
      cancel = true
      clearInterval(iv)
      unsubscribe()
    }
  }, [enabled])
  return count
}
