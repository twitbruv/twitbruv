import { useRouter } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
	Dialog as DialogRoot,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@workspace/ui/components/dialog"
import { Button } from "@workspace/ui/components/button"
import { authClient } from "../lib/auth"
import { api } from "../lib/api"
import { AppSidebar } from "./app-sidebar"
import { LightboxProvider } from "./lightbox-provider"
import { ComposeProvider, useCompose } from "./compose-provider"
import type { ReactNode } from "react"

export function AppShell({ children }: { children: ReactNode }) {
	const { data: session } = authClient.useSession()
	const authed = Boolean(session)

	return (
		<ComposeProvider>
			<LightboxProvider>
				{authed && <ChessChallengePoller enabled />}

				{/* Fixed sidebar - never scrolls, always visible at left edge of centered layout */}
				<div
					className="fixed top-0 z-40 h-svh w-[68px] xl:w-[240px]"
					style={{ left: "max(0px, calc((100vw - 1080px) / 2))" }}
				>
					<SidebarWithCompose />
				</div>

				{/* Main content - scrolls with body, scrollbar hugs right edge of viewport */}
				<div className="mx-auto flex min-h-svh max-w-[1080px]">
					{/* Spacer matching sidebar width so content isn't hidden behind it */}
					<div className="w-[68px] shrink-0 xl:w-[240px]" />
					<main className="flex-1">
						{children}
					</main>
					{/* Right gutter */}
					<div className="hidden w-[320px] shrink-0 lg:block" />
				</div>
			</LightboxProvider>
		</ComposeProvider>
	)
}

function SidebarWithCompose() {
	const compose = useCompose()
	return <AppSidebar onCompose={() => compose.open()} />
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
						onClick={() =>
							pendingGame && acceptMutation.mutate(pendingGame.id)
						}
					>
						Accept
					</Button>
				</DialogFooter>
			</DialogContent>
		</DialogRoot>
	)
}
