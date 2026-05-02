import { useEffect, useRef, useState } from "react"
import { useRouter, useRouterState } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  Dialog as DialogRoot,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Button } from "@workspace/ui/components/button"
import { authClient } from "../lib/auth"
import { api } from "../lib/api"
import { qk } from "../lib/query-keys"
import { AppSidebar } from "./app-sidebar"
import { LightboxProvider } from "./lightbox-provider"
import { YouTubePlayerProvider } from "./youtube-player-dialog"
import { ComposeProvider, useCompose } from "./compose-provider"
import { SettingsProvider } from "./settings/settings-provider"
import type { ReactNode } from "react"

export function AppShell({ children }: { children: ReactNode }) {
  const { data: session } = authClient.useSession()
  const authed = Boolean(session)
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const isAdminShell = pathname.startsWith("/admin")

  const sidebarLeftStyle = {
    left: "max(0px, calc((100vw - 1080px) / 2))",
  } as const

  const drawerEnabled = authed && !isAdminShell
  const drawer = useEdgeDrawer(drawerEnabled)

  return (
    <ComposeProvider>
      <SettingsProvider>
        <LightboxProvider>
          <YouTubePlayerProvider>
            {authed && <ChessChallengePoller enabled />}

            <div
              className={
                isAdminShell
                  ? "fixed top-0 z-40 h-svh w-[68px]"
                  : "fixed top-0 z-40 h-svh w-[68px] max-md:z-10 xl:w-[240px]"
              }
              style={sidebarLeftStyle}
            >
              <SidebarWithCompose compact={isAdminShell} />
            </div>

            <div
              className="relative z-20 mx-auto flex min-h-svh max-w-[1080px] touch-pan-y bg-base-1 pt-4 max-md:transition-transform max-md:duration-200 max-md:ease-out md:bg-transparent"
              style={drawer.contentStyle}
            >
              <div
                className={
                  isAdminShell
                    ? "w-[68px] shrink-0"
                    : "shrink-0 md:w-[68px] xl:w-[240px]"
                }
              />
              <main className="flex min-h-svh flex-1 flex-col">{children}</main>
              <div
                className={
                  isAdminShell
                    ? "hidden"
                    : "hidden w-[68px] shrink-0 lg:block xl:w-[240px]"
                }
              />
            </div>
          </YouTubePlayerProvider>
        </LightboxProvider>
      </SettingsProvider>
    </ComposeProvider>
  )
}

const DRAWER_WIDTH = 68
const SWIPE_DISTANCE_PX = 40

function useEdgeDrawer(enabled: boolean) {
  const [open, setOpen] = useState(false)
  const openRef = useRef(open)
  useEffect(() => {
    openRef.current = open
  }, [open])

  useEffect(() => {
    if (!enabled) return
    const isMobile = () => window.matchMedia("(max-width: 767px)").matches
    let start: { x: number; y: number; openAtStart: boolean } | null = null

    const onDown = (e: PointerEvent) => {
      if (!isMobile()) return
      start = { x: e.clientX, y: e.clientY, openAtStart: openRef.current }
    }
    const onUp = (e: PointerEvent) => {
      const s = start
      start = null
      if (!s) return
      const dx = e.clientX - s.x
      const dy = e.clientY - s.y
      if (Math.abs(dx) <= Math.abs(dy)) return
      if (Math.abs(dx) < SWIPE_DISTANCE_PX) return
      if (s.openAtStart && dx < 0) setOpen(false)
      else if (!s.openAtStart && dx > 0) setOpen(true)
    }
    const onCancel = () => {
      start = null
    }

    window.addEventListener("pointerdown", onDown)
    window.addEventListener("pointerup", onUp)
    window.addEventListener("pointercancel", onCancel)
    return () => {
      window.removeEventListener("pointerdown", onDown)
      window.removeEventListener("pointerup", onUp)
      window.removeEventListener("pointercancel", onCancel)
    }
  }, [enabled])

  const tx = enabled && open ? DRAWER_WIDTH : 0

  return {
    open,
    close: () => setOpen(false),
    contentStyle: { transform: `translateX(${tx}px)` } as const,
  }
}

function SidebarWithCompose({ compact }: { compact?: boolean }) {
  const compose = useCompose()
  return <AppSidebar compact={compact} onCompose={() => compose.open()} />
}

function ChessChallengePoller({ enabled }: { enabled: boolean }) {
  const router = useRouter()
  const queryClient = useQueryClient()

  const { data } = useQuery({
    queryKey: qk.chess.pending(),
    queryFn: () => api.chessPendingGames(),
    enabled,
    refetchInterval: 5000,
  })

  const acceptMutation = useMutation({
    mutationFn: (id: string) => api.chessAcceptGame(id),
    onSuccess: ({ game }) => {
      queryClient.invalidateQueries({ queryKey: qk.chess.pending() })
      router.navigate({ to: "/chess/$id", params: { id: game.id } })
    },
  })

  const declineMutation = useMutation({
    mutationFn: (id: string) => api.chessDeclineGame(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.chess.pending() })
    },
  })

  const pendingGame = data?.games[0]

  return (
    <DialogRoot open={!!pendingGame}>
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
    </DialogRoot>
  )
}
