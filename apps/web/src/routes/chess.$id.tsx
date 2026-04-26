import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useMemo, useRef, useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { Chess } from "chess.js"
import { Chessboard } from "react-chessboard"
import { Button } from "@workspace/ui/components/button"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { Input } from "@workspace/ui/components/input"
import { FlagIcon, HandPalmIcon } from "@phosphor-icons/react"
import { PageError, PageLoading } from "../components/page-surface"
import { PageFrame } from "../components/page-frame"
import { api } from "../lib/api"
import { useMe } from "../lib/me"
import { Avatar } from "../components/avatar"
import { subscribeToDmStream } from "../lib/dm-stream"

export const Route = createFileRoute("/chess/$id")({
  component: ChessGamePage,
})

function ChessGamePage() {
  const { id } = Route.useParams()
  const { me } = useMe()
  const queryClient = useQueryClient()
  const [chatMessage, setChatMessage] = useState("")
  const scrollRef = useRef<HTMLDivElement>(null)
  const [conversationId, setConversationId] = useState<string | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ["chess", "game", id],
    queryFn: () => api.chessGame(id),
    refetchInterval: 5000,
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
  const opponentId = isWhite ? game?.blackPlayerId : game?.whitePlayerId
  const orientation = isBlack ? "black" : "white"
  const isMyTurn =
    (chess.turn() === "w" && isWhite) || (chess.turn() === "b" && isBlack)
  const isFinished = game?.status !== "ongoing"

  useEffect(() => {
    if (opponentId && !conversationId) {
      api
        .dmStart(opponentId)
        .then((res) => {
          setConversationId(res.id)
        })
        .catch(() => {})
    }
  }, [opponentId, conversationId])

  const { data: dmsData, refetch: refetchDms } = useQuery({
    queryKey: ["dms", conversationId],
    queryFn: () => api.dmMessages(conversationId!),
    enabled: !!conversationId,
  })

  useEffect(() => {
    if (!conversationId) return
    const unsubscribe = subscribeToDmStream(() => {
      refetchDms()
    })
    return () => unsubscribe()
  }, [conversationId, refetchDms])

  const messages = dmsData?.messages ? [...dmsData.messages].reverse() : []

  function onDrop(sourceSquare: string, targetSquare: string) {
    if (!isMyTurn || isFinished) return false
    try {
      const move = chess.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: "q",
      })
      moveMutation.mutate(move.lan)
      return true
    } catch {
      return false
    }
  }

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault()
    if (!chatMessage.trim() || !conversationId) return
    api.dmSend(conversationId, { text: chatMessage }).then(() => {
      setChatMessage("")
      refetchDms()
    })
  }

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages.length, game?.pgn])

  if (isLoading)
    return (
      <PageFrame>
        <PageLoading label="Loading game..." />
      </PageFrame>
    )
  if (error || !game)
    return (
      <PageFrame>
        <PageError message="Game not found or error loading." />
      </PageFrame>
    )

  const myPlayerLabel = me?.handle ? `@${me.handle}` : "You"
  const opponentLabel = isWhite ? "Black Player" : "White Player"

  const topPlayer = isWhite ? opponentLabel : myPlayerLabel
  const bottomPlayer = isWhite ? myPlayerLabel : opponentLabel

  return (
    <PageFrame>
      <main className="flex justify-center p-4">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 md:flex-row">
          {/* Left side: Board */}
          <div className="mx-auto flex max-w-[600px] min-w-[300px] flex-1 flex-col md:mx-0">
            {/* Top Player Info */}
            <div className="flex items-center gap-2 rounded-t-lg border border-b-0 border-border bg-muted/20 p-2">
              <Avatar initial={topPlayer[0].toUpperCase()} size={32} />
              <span className="text-sm font-semibold">{topPlayer}</span>
            </div>

            {/* Board */}
            <div className="aspect-square w-full overflow-hidden rounded-sm border-4 border-border bg-[#769656] shadow-xl">
              <Chessboard
                options={{
                  position: chess.fen(),
                  onPieceDrop: ({ sourceSquare, targetSquare }) =>
                    onDrop(sourceSquare, targetSquare as string),
                  boardOrientation: orientation,
                  animationDurationInMs: 200,
                }}
              />
            </div>

            {/* Bottom Player Info */}
            <div className="flex items-center gap-2 rounded-b-lg border border-t-0 border-border bg-muted/20 p-2">
              <Avatar initial={bottomPlayer[0].toUpperCase()} size={32} />
              <span className="text-sm font-semibold">{bottomPlayer}</span>
            </div>
          </div>

          {/* Right side: Chat and Controls */}
          <div className="flex h-[600px] w-full shrink-0 flex-col overflow-hidden rounded-lg border border-border bg-background md:w-[350px]">
            <div className="border-b border-border bg-muted/40 p-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold">Game Review</h2>
                <span className="rounded bg-muted px-2 py-1 font-mono text-xs">
                  {isFinished ? game.status.toUpperCase() : "LIVE"}
                </span>
              </div>
            </div>

            {isFinished && (
              <div className="border-b border-border bg-muted/20 p-3">
                <Alert className="mb-0">
                  <AlertTitle className="text-sm">
                    {game.winnerId === me?.id
                      ? "You Won! 🎉"
                      : game.winnerId
                        ? "You Lost"
                        : "It's a Draw"}
                  </AlertTitle>
                  <AlertDescription className="mt-1 text-xs text-muted-foreground">
                    Game over by {game.status}.
                  </AlertDescription>
                </Alert>
              </div>
            )}

            <div className="flex gap-2 border-b border-border bg-muted/10 p-3">
              <Button
                variant="outline"
                className="flex-1"
                disabled={isFinished}
              >
                <HandPalmIcon size={16} className="mr-1.5" />
                Draw
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                disabled={isFinished}
              >
                <FlagIcon size={16} className="mr-1.5" />
                Resign
              </Button>
            </div>

            {/* Moves & Chat Area */}
            <div className="flex flex-1 flex-col overflow-hidden">
              <div className="flex border-b border-border text-xs font-medium">
                <button className="flex-1 border-r border-border py-2 text-center text-muted-foreground hover:bg-muted/40">
                  Moves
                </button>
                <button className="flex-1 border-b-2 border-primary py-2 text-center text-foreground">
                  Chat
                </button>
              </div>

              <div
                ref={scrollRef}
                className="flex flex-1 flex-col gap-2 overflow-y-auto bg-muted/5 p-3 text-sm"
              >
                {messages.length === 0 ? (
                  <div className="mt-4 text-center text-xs text-muted-foreground">
                    Send a message to your opponent...
                  </div>
                ) : (
                  messages.map((m) => (
                    <div key={m.id} className="flex flex-col">
                      <span className="text-xs font-semibold text-muted-foreground">
                        {m.senderId === me?.id ? "You" : "Opponent"}
                      </span>
                      <span>{m.text}</span>
                    </div>
                  ))
                )}
              </div>

              {/* Chat input */}
              <form
                onSubmit={handleSendChat}
                className="flex gap-2 border-t border-border p-2"
              >
                <Input
                  value={chatMessage}
                  onChange={(e) => setChatMessage(e.target.value)}
                  placeholder="Send a message..."
                  className="text-sm"
                  disabled={!conversationId}
                />
                <Button type="submit" size="sm" disabled={!conversationId}>
                  Send
                </Button>
              </form>
            </div>
          </div>
        </div>
      </main>
    </PageFrame>
  )
}
