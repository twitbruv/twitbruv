import { useLocation, useRouter } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  SidebarInset,
  SidebarProvider,
  useSidebar,
} from "@workspace/ui/components/sidebar"
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
import { useEffect } from "react"
import { authClient } from "../lib/auth"
import { api } from "../lib/api"
import { AppPageHeaderProvider } from "./app-page-header"
import { AppHeader } from "./app-header"
import { AppSidebar } from "./app-sidebar"
import { PublicShell } from "./public-shell"
import { ComposeFab } from "./compose-fab"
import type { ReactNode } from "react"

export function AppShell({ children }: { children: ReactNode }) {
  const { data: session, isPending } = authClient.useSession()
  const location = useLocation()
  const isInbox = location.pathname.startsWith("/inbox")

  if (isPending || !session) return <PublicShell>{children}</PublicShell>

  return (
    <TooltipProvider>
      <ChessChallengePoller enabled={Boolean(session)} />
      <AppPageHeaderProvider>
        <SidebarProvider>
          <AppSidebar enabled={Boolean(session)} />

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
