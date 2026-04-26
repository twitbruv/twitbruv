import { Hono } from 'hono'
import { and, desc, eq, or } from '@workspace/db'
import { schema } from '@workspace/db'
import { createChessGameSchema, moveChessSchema } from '@workspace/validators'
import { requireAuth, type HonoEnv } from '../middleware/session.ts'
import { Chess } from 'chess.js'

export const chessRoute = new Hono<HonoEnv>()

chessRoute.use('*', requireAuth())

async function getOrCreateStats(db: any, userId: string) {
  const [stats] = await db.select().from(schema.chessStats).where(eq(schema.chessStats.userId, userId)).limit(1)
  if (stats) return stats

  const [newStats] = await db.insert(schema.chessStats).values({ userId, elo: 800 }).returning()
  return newStats
}

function calculateElo(rating1: number, rating2: number, result: number) {
  const K = 32
  const expected = 1 / (1 + Math.pow(10, (rating2 - rating1) / 400))
  return Math.round(rating1 + K * (result - expected))
}

chessRoute.get('/pending', async (c) => {
  const session = c.get('session')!
  const { db } = c.get('ctx')

  const games = await db
    .select({
      id: schema.chessGames.id,
      whitePlayerId: schema.chessGames.whitePlayerId,
      blackPlayerId: schema.chessGames.blackPlayerId,
      createdAt: schema.chessGames.createdAt,
      challenger: schema.users,
    })
    .from(schema.chessGames)
    .innerJoin(schema.users, eq(schema.users.id, schema.chessGames.whitePlayerId))
    .where(
      and(
        eq(schema.chessGames.status, 'pending'),
        eq(schema.chessGames.blackPlayerId, session.user.id),
      ),
    )

  return c.json({ games })
})

chessRoute.post('/:id/accept', async (c) => {
  const session = c.get('session')!
  const id = c.req.param('id')
  const { db } = c.get('ctx')

  const [game] = await db
    .update(schema.chessGames)
    .set({ status: 'ongoing', updatedAt: new Date() })
    .where(and(eq(schema.chessGames.id, id), eq(schema.chessGames.blackPlayerId, session.user.id)))
    .returning()

  if (!game) return c.json({ error: 'not_found' }, 404)
  return c.json({ game })
})

chessRoute.post('/:id/decline', async (c) => {
  const session = c.get('session')!
  const id = c.req.param('id')
  const { db } = c.get('ctx')

  const [game] = await db
    .update(schema.chessGames)
    .set({ status: 'declined', updatedAt: new Date() })
    .where(and(eq(schema.chessGames.id, id), eq(schema.chessGames.blackPlayerId, session.user.id)))
    .returning()

  if (!game) return c.json({ error: 'not_found' }, 404)
  return c.json({ game })
})

chessRoute.get('/active', async (c) => {
  const session = c.get('session')!
  const { db } = c.get('ctx')

  const games = await db
    .select()
    .from(schema.chessGames)
    .where(
      and(
        eq(schema.chessGames.status, 'ongoing'),
        or(
          eq(schema.chessGames.whitePlayerId, session.user.id),
          eq(schema.chessGames.blackPlayerId, session.user.id),
        ),
      ),
    )
    .orderBy(desc(schema.chessGames.updatedAt))

  return c.json({ games })
})

chessRoute.get('/leaderboard', async (c) => {
  const { db } = c.get('ctx')

  const leaderboard = await db
    .select({
      userId: schema.chessStats.userId,
      elo: schema.chessStats.elo,
      wins: schema.chessStats.wins,
      losses: schema.chessStats.losses,
      draws: schema.chessStats.draws,
      name: schema.users.name,
      handle: schema.users.handle,
      displayName: schema.users.displayName,
      avatarUrl: schema.users.avatarUrl,
    })
    .from(schema.chessStats)
    .innerJoin(schema.users, eq(schema.users.id, schema.chessStats.userId))
    .orderBy(desc(schema.chessStats.elo))
    .limit(50)

  return c.json({ leaderboard })
})

chessRoute.get('/:id', async (c) => {
  const id = c.req.param('id')
  const { db } = c.get('ctx')

  const [game] = await db.select().from(schema.chessGames).where(eq(schema.chessGames.id, id)).limit(1)
  if (!game) return c.json({ error: 'not_found' }, 404)

  return c.json({ game })
})

chessRoute.post('/', async (c) => {
  const session = c.get('session')!
  const { db } = c.get('ctx')
  const body = createChessGameSchema.parse(await c.req.json())

  // For simplicity, the creator is white, opponent is black
  // In a real app, you might want to randomize this or have a challenge system
  const [game] = await db
    .insert(schema.chessGames)
    .values({
      whitePlayerId: session.user.id,
      blackPlayerId: body.opponentId,
    })
    .returning()

  c.get('ctx').track('chess_game_created', session.user.id)
  return c.json({ game })
})

chessRoute.post('/:id/move', async (c) => {
  const session = c.get('session')!
  const id = c.req.param('id')
  const { db } = c.get('ctx')
  const body = moveChessSchema.parse(await c.req.json())

  const [game] = await db.select().from(schema.chessGames).where(eq(schema.chessGames.id, id)).limit(1)
  if (!game) return c.json({ error: 'not_found' }, 404)
  if (game.status !== 'ongoing') return c.json({ error: 'game_finished' }, 400)

  const chess = new Chess(game.fen)
  const turn = chess.turn() // 'w' or 'b'
  const isWhiteTurn = turn === 'w'
  const currentPlayerId = isWhiteTurn ? game.whitePlayerId : game.blackPlayerId

  if (currentPlayerId !== session.user.id) {
    return c.json({ error: 'not_your_turn' }, 400)
  }

  try {
    const moveResult = chess.move(body.move)
    if (!moveResult) return c.json({ error: 'invalid_move' }, 400)

    let status: typeof schema.chessGames.$inferSelect.status = 'ongoing'
    let winnerId: string | null = null

    if (chess.isCheckmate()) {
      status = 'checkmate'
      winnerId = session.user.id
    } else if (chess.isGameOver()) {
      status = 'draw'
    }

    const [updatedGame] = await db
      .update(schema.chessGames)
      .set({
        fen: chess.fen(),
        pgn: chess.pgn(),
        status,
        winnerId,
        updatedAt: new Date(),
      })
      .where(eq(schema.chessGames.id, id))
      .returning()

    if (status !== 'ongoing') {
      // Update ELO
      const whiteStats = await getOrCreateStats(db, game.whitePlayerId)
      const blackStats = await getOrCreateStats(db, game.blackPlayerId)

      let result = 0.5 // draw
      if (status === 'checkmate') {
        result = winnerId === game.whitePlayerId ? 1 : 0
      }

      const newWhiteElo = calculateElo(whiteStats.elo, blackStats.elo, result)
      const newBlackElo = calculateElo(blackStats.elo, whiteStats.elo, 1 - result)

      await db.transaction(async (tx) => {
        await tx
          .update(schema.chessStats)
          .set({
            elo: newWhiteElo,
            wins: result === 1 ? whiteStats.wins + 1 : whiteStats.wins,
            losses: result === 0 ? whiteStats.losses + 1 : whiteStats.losses,
            draws: result === 0.5 ? whiteStats.draws + 1 : whiteStats.draws,
            updatedAt: new Date(),
          })
          .where(eq(schema.chessStats.userId, game.whitePlayerId))

        await tx
          .update(schema.chessStats)
          .set({
            elo: newBlackElo,
            wins: result === 0 ? blackStats.wins + 1 : blackStats.wins,
            losses: result === 1 ? blackStats.losses + 1 : blackStats.losses,
            draws: result === 0.5 ? blackStats.draws + 1 : blackStats.draws,
            updatedAt: new Date(),
          })
          .where(eq(schema.chessStats.userId, game.blackPlayerId))
      })
    }

    return c.json({ game: updatedGame })
  } catch (e) {
    return c.json({ error: 'invalid_move' }, 400)
  }
})
