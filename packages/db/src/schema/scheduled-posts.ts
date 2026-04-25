import { sql } from 'drizzle-orm'
import { boolean, check, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { users } from './auth.ts'
import { posts } from './posts.ts'
import { postVisibilityEnum, replyRestrictionEnum } from './enums.ts'

// Drafts and scheduled posts share one table — a draft is just a row with scheduledFor=null.
// Once published, publishedPostId is set and the row is kept for history (won't appear in
// drafts/scheduled lists).
export const scheduledPosts = pgTable(
  'scheduled_posts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    mediaIds: uuid('media_ids').array().notNull().default(sql`ARRAY[]::uuid[]`),
    visibility: postVisibilityEnum('visibility').notNull().default('public'),
    replyRestriction: replyRestrictionEnum('reply_restriction').notNull().default('anyone'),
    sensitive: boolean('sensitive').notNull().default(false),
    contentWarning: text('content_warning'),
    // Null = saved draft, not scheduled. Non-null = publish at this instant.
    scheduledFor: timestamp('scheduled_for', { withTimezone: true }),
    publishedPostId: uuid('published_post_id').references(() => posts.id, { onDelete: 'set null' }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    failedAt: timestamp('failed_at', { withTimezone: true }),
    failureReason: text('failure_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('scheduled_posts_text_len', sql`char_length(${t.text}) <= 500`),
    // Lookup pending drafts/scheduled by author.
    index('scheduled_posts_author_idx')
      .on(t.authorId, t.createdAt)
      .where(sql`${t.publishedAt} IS NULL`),
    // The worker scans this index to find rows due for publishing. Only includes scheduled
    // (not draft) and not-yet-published rows.
    index('scheduled_posts_due_idx')
      .on(t.scheduledFor)
      .where(sql`${t.scheduledFor} IS NOT NULL AND ${t.publishedAt} IS NULL AND ${t.failedAt} IS NULL`),
  ],
)
