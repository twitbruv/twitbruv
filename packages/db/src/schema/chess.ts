import { index, pgEnum, pgTable, text, timestamp, uuid, integer } from 'drizzle-orm/pg-core'
import { users } from './auth.ts'

export const chessGameStatusEnum = pgEnum('chess_game_status', [
  'pending',
  'ongoing',
  'checkmate',
  'draw',
  'resigned',
  'timeout',
  'aborted',
  'declined',
])

export const chessGames = pgTable(
  'chess_games',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    whitePlayerId: uuid('white_player_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    blackPlayerId: uuid('black_player_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    fen: text('fen').notNull().default('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'),
    pgn: text('pgn').notNull().default(''),
    status: chessGameStatusEnum('status').notNull().default('pending'),
    winnerId: uuid('winner_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('chess_games_white_player_idx').on(t.whitePlayerId),
    index('chess_games_black_player_idx').on(t.blackPlayerId),
    index('chess_games_status_idx').on(t.status),
  ],
)

export const chessStats = pgTable(
  'chess_stats',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    elo: integer('elo').notNull().default(800),
    wins: integer('wins').notNull().default(0),
    losses: integer('losses').notNull().default(0),
    draws: integer('draws').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('chess_stats_elo_idx').on(t.elo)],
)
