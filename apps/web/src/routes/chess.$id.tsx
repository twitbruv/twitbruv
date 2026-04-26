import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useMemo, useState, useEffect, useRef } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { Chess } from "chess.js"
import { Chessboard } from "react-chessboard"
import { PageLoading, PageError } from "../components/page-surface"
import { PageFrame } from "../components/page-frame"
import { api } from "../lib/api"
import { useMe } from "../lib/me"
import { Button } from "@workspace/ui/components/button"
import { Alert, AlertDescription, AlertTitle } from "@workspace/ui/components/alert"
import { Input } from "@workspace/ui/components/input"
import { IconFlag, IconHandStop } from "@tabler/icons-react"
import { Avatar } from "../components/avatar"
import { subscribeToDmStream } from "../lib/dm-stream"

export const Route = createFileRoute("/chess/$id")({
  component: ChessGamePage,
})

function ChessGamePage() {
  const { id } = Route.useParams() as { id: string }
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
  const orientation = (isBlack ? "black" : "white") as "white" | "black"
  const isMyTurn = (chess.turn() === "w" && isWhite) || (chess.turn() === "b" && isBlack)
  const isFinished = game?.status !== "ongoing"

  useEffect(() => {
    if (opponentId && !conversationId) {
      api.dmStart(opponentId).then((res) => {
        setConversationId(res.id)
      }).catch(() => {})
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
      if (move) {
        moveMutation.mutate(move.lan)
        return true
      }
    } catch (e) {
      return false
    }
    return false
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

  if (isLoading) return <PageFrame><PageLoading label="Loading game..." /></PageFrame>
  if (error || !game) return <PageFrame><PageError message="Game not found or error loading." /></PageFrame>

  const myPlayerLabel = me?.handle ? `@${me.handle}` : "You"
  const opponentLabel = isWhite ? "Black Player" : "White Player"

  const topPlayer = isWhite ? opponentLabel : myPlayerLabel
  const bottomPlayer = isWhite ? myPlayerLabel : opponentLabel

  return (
    <PageFrame>
      <main className="p-4 flex justify-center">
        <div className="mx-auto flex w-full max-w-5xl flex-col md:flex-row gap-4">
          {/* Left side: Board */}
          <div className="flex-1 flex flex-col min-w-[300px] max-w-[600px] mx-auto md:mx-0">
            {/* Top Player Info */}
            <div className="flex items-center gap-2 p-2 bg-muted/20 border border-border border-b-0 rounded-t-lg">
              <Avatar initial={topPlayer[0].toUpperCase()} size={32} />
              <span className="font-semibold text-sm">{topPlayer}</span>
            </div>
            
            {/* Board */}
            <div className="w-full border-4 border-border rounded-sm shadow-xl overflow-hidden aspect-square bg-[#769656]">
              <Chessboard 
                options={{
                  position: chess.fen(),
                  onPieceDrop: ({ sourceSquare, targetSquare }) => onDrop(sourceSquare as string, targetSquare as string),
                  boardOrientation: orientation,
                  animationDurationInMs: 200,
                }}
              />
            </div>

            {/* Bottom Player Info */}
            <div className="flex items-center gap-2 p-2 bg-muted/20 border border-border border-t-0 rounded-b-lg">
              <Avatar initial={bottomPlayer[0].toUpperCase()} size={32} />
              <span className="font-semibold text-sm">{bottomPlayer}</span>
            </div>
          </div>

          {/* Right side: Chat and Controls */}
          <div className="flex w-full md:w-[350px] flex-col border border-border rounded-lg bg-background overflow-hidden h-[600px] shrink-0">
            <div className="p-3 border-b border-border bg-muted/40">
              <div className="flex items-center justify-between">
                  <h2 className="font-bold text-sm">Game Review</h2>
                  <span className="text-xs font-mono px-2 py-1 bg-muted rounded">
                    {isFinished ? game.status.toUpperCase() : "LIVE"}
                  </span>
              </div>
            </div>

            {isFinished && (
              <div className="p-3 bg-muted/20 border-b border-border">
                <Alert className="mb-0">
                  <AlertTitle className="text-sm">
                    {game.winnerId === me?.id ? "You Won! 🎉" : game.winnerId ? "You Lost" : "It's a Draw"}
                  </AlertTitle>
                  <AlertDescription className="text-xs text-muted-foreground mt-1">
                    Game over by {game.status}.
                  </AlertDescription>
                </Alert>
              </div>
            )}

            <div className="p-3 flex gap-2 border-b border-border bg-muted/10">
              <Button variant="outline" className="flex-1" disabled={isFinished}>
                <IconHandStop size={16} className="mr-1.5" />
                Draw
              </Button>
              <Button variant="destructive" className="flex-1" disabled={isFinished}>
                <IconFlag size={16} className="mr-1.5" />
                Resign
              </Button>
            </div>

            {/* Moves & Chat Area */}
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex text-xs border-b border-border font-medium">
                <button className="flex-1 py-2 text-center text-muted-foreground hover:bg-muted/40 border-r border-border">Moves</button>
                <button className="flex-1 py-2 text-center border-b-2 border-primary text-foreground">Chat</button>
              </div>

              <div ref={scrollRef} className="flex-1 p-3 overflow-y-auto flex flex-col gap-2 text-sm bg-muted/5">
                {messages.length === 0 ? (
                  <div className="text-xs text-muted-foreground text-center mt-4">Send a message to your opponent...</div>
                ) : (
                  messages.map((m) => (
                    <div key={m.id} className="flex flex-col">
                      <span className="font-semibold text-xs text-muted-foreground">{m.senderId === me?.id ? "You" : "Opponent"}</span>
                      <span>{m.text}</span>
                    </div>
                  ))
                )}
              </div>

              {/* Chat input */}
              <form onSubmit={handleSendChat} className="p-2 border-t border-border flex gap-2">
                <Input 
                  value={chatMessage} 
                  onChange={e => setChatMessage(e.target.value)}
                  placeholder="Send a message..." 
                  className="text-sm"
                  disabled={!conversationId}
                />
                <Button type="submit" size="sm" disabled={!conversationId}>Send</Button>
              </form>
            </div>
          </div>
        </div>
      </main>
    </PageFrame>
  )
}

