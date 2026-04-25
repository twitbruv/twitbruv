import { check, index, integer, pgTable, primaryKey, smallint, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { boolean } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { users } from './auth.ts'
import { posts } from './posts.ts'

// One poll per post. The poll's lifetime (open/closed) is determined entirely by closesAt; we
// don't need a separate state column.
export const polls = pgTable(
  'polls',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    postId: uuid('post_id')
      .notNull()
      .unique()
      .references(() => posts.id, { onDelete: 'cascade' }),
    closesAt: timestamp('closes_at', { withTimezone: true }).notNull(),
    allowMultiple: boolean('allow_multiple').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('polls_closes_at_idx').on(t.closesAt)],
)

export const pollOptions = pgTable(
  'poll_options',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pollId: uuid('poll_id')
      .notNull()
      .references(() => polls.id, { onDelete: 'cascade' }),
    position: smallint('position').notNull(),
    text: text('text').notNull(),
    voteCount: integer('vote_count').notNull().default(0),
  },
  (t) => [
    index('poll_options_poll_idx').on(t.pollId, t.position),
    check('poll_options_text_len', sql`char_length(${t.text}) BETWEEN 1 AND 80`),
  ],
)

export const pollVotes = pgTable(
  'poll_votes',
  {
    pollId: uuid('poll_id')
      .notNull()
      .references(() => polls.id, { onDelete: 'cascade' }),
    optionId: uuid('option_id')
      .notNull()
      .references(() => pollOptions.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // (pollId, optionId, userId) is the natural PK — supports both single-choice (one row per
    // poll/user, enforced at the route layer) and multi-choice (multiple rows per poll/user).
    primaryKey({ columns: [t.pollId, t.optionId, t.userId] }),
    index('poll_votes_user_poll_idx').on(t.userId, t.pollId),
  ],
)
