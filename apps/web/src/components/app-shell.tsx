import { Link, useLocation } from "@tanstack/react-router"
import {
  IconBell,
  IconBookmark,
  IconClock,
  IconHome,
  IconList,
  IconMail,
  IconPencil,
  IconSearch,
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
  const isHomeRoute = location.pathname === "/"
  const mainWidthClass = isHomeRoute
    ? "md:max-w-[640px] md:border-x @min-[1120px]/inset:max-w-none @min-[1120px]/inset:border-x-0"
    : "md:max-w-[640px] md:border-x"

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
                            <span className="ml-auto rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground group-data-[collapsible=icon]:hidden">
                              {unread > 99 ? "99+" : unread}
                            </span>
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
                            <span className="ml-auto rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground group-data-[collapsible=icon]:hidden">
                              {dmUnread > 99 ? "99+" : dmUnread}
                            </span>
                          )}
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
          <div className="@container/inset flex min-h-0 flex-1 justify-center">
            <main
              className={`flex min-h-0 w-full min-w-0 flex-1 flex-col border-border ${mainWidthClass}`}
            >
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
        const { count } = await api.notificationsUnreadCount()
        if (!cancel) setCount(count)
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
        const { count } = await api.dmUnreadCount()
        if (!cancel) setCount(count)
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
  const location = useLocation()
  const { setOpenMobile } = useSidebar()

  useEffect(() => {
    setOpenMobile(false)
  }, [location.pathname, setOpenMobile])

  return null
}
