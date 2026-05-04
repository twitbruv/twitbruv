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
import { AppMobileIslandNav } from "./app-mobile-island-nav"
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
  const showMobileIslandNav = authed && !isAdminShell

  const sidebarLeftStyle = {
    left: "max(0px, calc((100vw - 1080px) / 2))",
  } as const

  return (
    <ComposeProvider>
      <SettingsProvider>
        <LightboxProvider>
          <YouTubePlayerProvider>
            {authed && <ChessChallengePoller enabled />}

            <div
              className={
                isAdminShell
                  ? "fixed top-0 z-40 hidden h-svh w-[68px] md:block"
                  : "fixed top-0 z-40 hidden h-svh w-[68px] md:block xl:w-[240px]"
              }
              style={sidebarLeftStyle}
            >
              <SidebarWithCompose compact={isAdminShell} />
            </div>

            <div className="mx-auto flex min-h-svh max-w-[1080px]">
              <div
                className={
                  isAdminShell
                    ? "hidden w-[68px] shrink-0 md:block"
                    : "hidden w-[68px] shrink-0 md:block xl:w-[240px]"
                }
              />
              <main
                className={
                  showMobileIslandNav
                    ? "flex min-h-svh min-w-0 flex-1 flex-col pb-32 md:pb-0"
                    : "flex min-h-svh min-w-0 flex-1 flex-col"
                }
              >
                {children}
              </main>
              <div
                className={
                  isAdminShell
                    ? "hidden"
                    : "hidden w-[68px] shrink-0 lg:block xl:w-[240px]"
                }
              />
            </div>
            {showMobileIslandNav ? <AppMobileIslandNav /> : null}
          </YouTubePlayerProvider>
        </LightboxProvider>
      </SettingsProvider>
    </ComposeProvider>
  )
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
