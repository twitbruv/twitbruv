import { z } from 'zod'

export const createChessGameSchema = z.object({
  opponentId: z.string().uuid(),
})

export const moveChessSchema = z.object({
  gameId: z.string().uuid(),
  move: z.string(), // algebraic notation or object
})

export type CreateChessGameInput = z.infer<typeof createChessGameSchema>
export type MoveChessInput = z.infer<typeof moveChessSchema>
