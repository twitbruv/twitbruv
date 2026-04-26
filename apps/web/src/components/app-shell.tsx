import { Link, useLocation, useRouter } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
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
} from "@phosphor-icons/react"
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Button } from "@workspace/ui/components/button"
import { useEffect, useState } from "react"
import { authClient } from "../lib/auth"
import { api } from "../lib/api"
import { APP_NAME } from "../lib/env"
import { subscribeToDmStream } from "../lib/dm-stream"
import { useMe } from "../lib/me"
import { AppPageHeaderProvider } from "./app-page-header"
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
      <ChessChallengePoller enabled={Boolean(session)} />
      <AppPageHeaderProvider>
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
                            <HouseIcon />
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
                            <MagnifyingGlassIcon />
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
                            <BellIcon />
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
                            <EnvelopeIcon />
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
                        tooltip="analytics"
                        render={
                          <Link to="/analytics">
                            <ChartBarIcon />
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
                            <BookmarkIcon />
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
                            <ListIcon />
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
                            <ClockIcon />
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
                            <PencilIcon />
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
              <main className="w-full min-w-0 border-border">{children}</main>
            </div>
            {!isInbox && <ComposeFab />}
          </SidebarInset>
          <SidebarCloseOnNavigate />
        </SidebarProvider>
      </AppPageHeaderProvider>
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

function ChessChallengePoller({ enabled }: { enabled: boolean }) {
  const router = useRouter()
  const queryClient = useQueryClient()

  const { data } = useQuery({
    queryKey: ["chess", "pending"],
    queryFn: () => api.chessPendingGames(),
    enabled,
    refetchInterval: 5000,
  })

  const acceptMutation = useMutation({
    mutationFn: (id: string) => api.chessAcceptGame(id),
    onSuccess: ({ game }) => {
      queryClient.invalidateQueries({ queryKey: ["chess", "pending"] })
      router.navigate({ to: "/chess/$id", params: { id: game.id } })
    },
  })

  const declineMutation = useMutation({
    mutationFn: (id: string) => api.chessDeclineGame(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chess", "pending"] })
    },
  })

  const pendingGame = data?.games[0]

  return (
    <Dialog open={!!pendingGame}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Chess Challenge!</DialogTitle>
          <DialogDescription>
            {pendingGame?.challenger.displayName ||
              pendingGame?.challenger.handle ||
              "Someone"}{" "}
            has challenged you to a game of Chess.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-4 flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() =>
              pendingGame && declineMutation.mutate(pendingGame.id)
            }
          >
            Decline
          </Button>
          <Button
            onClick={() => pendingGame && acceptMutation.mutate(pendingGame.id)}
          >
            Accept
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
