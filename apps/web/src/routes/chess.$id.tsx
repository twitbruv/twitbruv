import { createFileRoute } from "@tanstack/react-router"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useMemo } from "react"
import { Chess } from "chess.js"
import { Chessboard } from "react-chessboard"
import { PageHeader, PageLoading, PageError } from "../components/page-surface"
import { PageFrame } from "../components/page-frame"
import { api } from "../lib/api"
import { useMe } from "../lib/me"
import { Button } from "@workspace/ui/components/button"
import { Alert, AlertDescription, AlertTitle } from "@workspace/ui/components/alert"
import { IconRotate, IconFlag } from "@tabler/icons-react"

export const Route = createFileRoute("/chess/$id")({
  component: ChessGamePage,
})

function ChessGamePage() {
  const { id } = Route.useParams() as { id: string }
  const { me } = useMe()
  const queryClient = useQueryClient()
  
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["chess", "game", id],
    queryFn: () => api.chessGame(id),
    refetchInterval: 5000, // Poll every 5 seconds for opponent moves
  })

  const moveMutation = useMutation({
    mutationFn: (move: string) => api.chessMove(id, move),
    onSuccess: (newData) => {
      queryClient.setQueryData(["chess", "game", id], newData)
    },
  })

  const game = data?.game
  const chess = useMemo(() => new Chess(game?.fen), [game?.fen])
  
  const isWhite = game?.whitePlayerId === me?.id
  const isBlack = game?.blackPlayerId === me?.id
  const orientation = (isBlack ? "black" : "white") as "white" | "black"
  const isMyTurn = (chess.turn() === "w" && isWhite) || (chess.turn() === "b" && isBlack)
  const isFinished = game?.status !== "ongoing"

  function onDrop(sourceSquare: string, targetSquare: string) {
    if (!isMyTurn || isFinished) return false

    try {
      const move = chess.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: "q", // always promote to queen for simplicity
      })

      if (move) {
        moveMutation.mutate(move.lan)
        return true
      }
    } catch (e) {
      return false
    }
    return false
  }

  if (isLoading) return <PageFrame><PageLoading label="Loading game..." /></PageFrame>
  if (error || !game) return <PageFrame><PageError message="Game not found or error loading." /></PageFrame>

  return (
    <PageFrame>
      <main>
        <PageHeader title={`Chess vs ${isWhite ? "Opponent" : "Opponent"}`} />
        
        <div className="p-4 flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-sm font-medium">
                {isFinished ? "Game Finished" : isMyTurn ? "Your turn" : "Waiting for opponent..."}
              </span>
              <span className="text-xs text-muted-foreground uppercase tracking-wider">
                {chess.turn() === "w" ? "White's turn" : "Black's turn"}
              </span>
            </div>
            
            {isFinished && (
              <Alert className="max-w-xs">
                <AlertTitle>
                  {game.winnerId === me?.id ? "You Won! 🎉" : game.winnerId ? "You Lost" : "It's a Draw"}
                </AlertTitle>
                <AlertDescription>
                  Status: {game.status}
                </AlertDescription>
              </Alert>
            )}
          </div>

          <div className="aspect-square w-full max-w-[500px] mx-auto border-4 border-border rounded-sm shadow-xl overflow-hidden">
            <Chessboard 
              options={{
                position: chess.fen(),
                onPieceDrop: ({ sourceSquare, targetSquare }) => onDrop(sourceSquare as string, targetSquare as string),
                boardOrientation: orientation,
                animationDurationInMs: 200,
              }}
            />
          </div>

          <div className="flex justify-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <IconRotate size={16} className="mr-2" />
              Refresh
            </Button>
            {!isFinished && (
              <Button variant="destructive" size="sm" disabled>
                <IconFlag size={16} className="mr-2" />
                Resign
              </Button>
            )}
          </div>

          <div className="mt-4">
            <h3 className="text-sm font-bold mb-2 uppercase tracking-tighter text-muted-foreground">History (PGN)</h3>
            <div className="bg-muted/30 p-3 rounded border border-border text-xs font-mono break-all whitespace-pre-wrap h-24 overflow-y-auto">
              {game.pgn || "No moves yet."}
            </div>
          </div>
        </div>
      </main>
    </PageFrame>
  )
}
