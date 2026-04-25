import { Link } from "@tanstack/react-router"
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
  const unread = useUnreadNotifications(Boolean(session))
  const dmUnread = useUnreadDms(Boolean(session))

  // Render the lightweight public shell while we don't have a confirmed session. This covers
  // SSR (no session yet), the brief client hydration window, and any time the user is logged out.
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
          <div className="flex flex-1 justify-center">
            <main className="w-full flex-1 border-border md:max-w-[640px] md:border-x">
              {children}
            </main>
            {/* <RightRail /> */}
          </div>
          <ComposeFab />
        </SidebarInset>
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
      } catch {
        /* network blip; try again next tick */
      }
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
      } catch {
        /* network blip; will reconcile on the next stream event or slow poll */
      }
    }
    refresh()
    // Slow background reconcile in case the SSE stream silently stalls.
    const iv = setInterval(refresh, 120_000)
    // Nudge the count whenever the stream surfaces a message or read event — that covers both
    // "new message arrived" (increment) and "I read somewhere else" (decrement) without needing
    // to compute deltas locally.
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
