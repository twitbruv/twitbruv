import { Link, useLocation, useRouter } from "@tanstack/react-router"
import {
  IconBell,
  IconBookmark,
  IconChartBar,
  IconClock,
  IconHome,
  IconList,
  IconMail,
  IconPencil,
  IconSearch,
  IconTrophy,
} from "@tabler/icons-react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  useSidebar,
} from "@workspace/ui/components/sidebar"
import { Badge } from "@workspace/ui/components/badge"
import { TooltipProvider } from "@workspace/ui/components/tooltip"
import { useEffect, useState } from "react"
import { authClient } from "../lib/auth"
import { api } from "../lib/api"
import { APP_NAME } from "../lib/env"
import { subscribeToDmStream } from "../lib/dm-stream"
import { useMe } from "../lib/me"
import { AppHeader } from "./app-header"
import { PublicShell } from "./public-shell"
import { UserNav } from "./user-nav"
import { ComposeFab } from "./compose-fab"
import type { ReactNode } from "react"

export function AppShell({ children }: { children: ReactNode }) {
  const { data: session, isPending } = authClient.useSession()
  const { me } = useMe()
  const location = useLocation()
  const unread = useUnreadNotifications(Boolean(session))
  const dmUnread = useUnreadDms(Boolean(session))
  const isInbox = location.pathname.startsWith("/inbox")

  if (isPending || !session) return <PublicShell>{children}</PublicShell>

  return (
    <TooltipProvider>
      <SidebarProvider>
        <Sidebar collapsible="icon">
          <SidebarHeader className="p-2">
            <Link to="/" className="flex items-center gap-2">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
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
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      size="default"
                      tooltip="home"
                      render={
                        <Link to="/">
                          <IconHome />
                          <span>Home</span>
                        </Link>
                      }
                    />
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      size="default"
                      tooltip="search"
                      render={
                        <Link to="/search">
                          <IconSearch />
                          <span>Search</span>
                        </Link>
                      }
                    />
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      size="default"
                      tooltip="notifications"
                      render={
                        <Link to="/notifications">
                          <IconBell />
                          <span>Notifications</span>
                          {unread > 0 && (
                            <Badge
                              className="ml-auto min-w-5 tabular-nums group-data-[collapsible=icon]:hidden"
                              variant="default"
                            >
                              {unread > 99 ? "99+" : unread}
                            </Badge>
                          )}
                        </Link>
                      }
                    />
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      size="default"
                      tooltip="messages"
                      render={
                        <Link to="/inbox">
                          <IconMail />
                          <span>Messages</span>
                          {dmUnread > 0 && (
                            <Badge
                              className="ml-auto min-w-5 tabular-nums group-data-[collapsible=icon]:hidden"
                              variant="default"
                            >
                              {dmUnread > 99 ? "99+" : dmUnread}
                            </Badge>
                          )}
                        </Link>
                      }
                    />
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      size="default"
                      tooltip="chess"
                      render={
                        <Link to="/chess">
                          <IconTrophy />
                          <span>Chess</span>
                        </Link>
                      }
                    />
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      size="default"
                      tooltip="analytics"
                      render={
                        <Link to="/analytics">
                          <IconChartBar />
                          <span>Analytics</span>
                        </Link>
                      }
                    />
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      size="default"
                      tooltip="bookmarks"
                      render={
                        <Link to="/bookmarks">
                          <IconBookmark />
                          <span>Bookmarks</span>
                        </Link>
                      }
                    />
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      size="default"
                      tooltip="lists"
                      render={
                        <Link to="/lists">
                          <IconList />
                          <span>Lists</span>
                        </Link>
                      }
                    />
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      size="default"
                      tooltip="drafts"
                      render={
                        <Link to="/drafts">
                          <IconClock />
                          <span>Drafts</span>
                        </Link>
                      }
                    />
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      size="default"
                      tooltip="write article"
                      render={
                        <Link to="/articles/new">
                          <IconPencil />
                          <span>Write Article</span>
                        </Link>
                      }
                    />
                  </SidebarMenuItem>
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

        <SidebarInset>
          <AppHeader />
          <div className="@container/inset w-full min-w-0">
            <main className="w-full min-w-0 border-border">
              {children}
            </main>
          </div>
          {!isInbox && <ComposeFab />}
        </SidebarInset>
        <SidebarCloseOnNavigate />
      </SidebarProvider>
    </TooltipProvider>
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
    async function tick() {
      try {
        const { count: next } = await api.notificationsUnreadCount()
        if (!cancel) setCount(next)
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
    async function refresh() {
      try {
        const { count: next } = await api.dmUnreadCount()
        if (!cancel) setCount(next)
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

function SidebarCloseOnNavigate() {
  const router = useRouter()
  const { setOpenMobile } = useSidebar()

  useEffect(() => {
    return router.subscribe("onResolved", () => {
      setOpenMobile(false)
    })
  }, [router, setOpenMobile])

  return null
}
