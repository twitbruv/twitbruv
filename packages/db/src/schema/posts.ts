import { sql } from 'drizzle-orm'
import {
  bigint,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uuid,
  customType,
} from 'drizzle-orm/pg-core'
import { users } from './auth.ts'
import { postVisibilityEnum, replyRestrictionEnum } from './enums.ts'
import { boolean } from 'drizzle-orm/pg-core'

const citext = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'citext'
  },
})

export const posts = pgTable(
  'posts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    lang: text('lang'),
    replyToId: uuid('reply_to_id').references((): any => posts.id, { onDelete: 'set null' }),
    quoteOfId: uuid('quote_of_id').references((): any => posts.id, { onDelete: 'set null' }),
    repostOfId: uuid('repost_of_id').references((): any => posts.id, { onDelete: 'cascade' }),
    rootId: uuid('root_id').references((): any => posts.id, { onDelete: 'set null' }),
    conversationDepth: integer('conversation_depth').notNull().default(0),
    visibility: postVisibilityEnum('visibility').notNull().default('public'),
    sensitive: boolean('sensitive').notNull().default(false),
    contentWarning: text('content_warning'),
    replyRestriction: replyRestrictionEnum('reply_restriction').notNull().default('anyone'),
    editedAt: timestamp('edited_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    // Set when the author of the conversation root hides this reply. The reply is still
    // visible in the original author's own profile and to anyone with the direct link;
    // it's only collapsed/hidden from the conversation view of the root post (X parity).
    hiddenAt: timestamp('hidden_at', { withTimezone: true }),
    // Timestamp the author last pinned this post to their profile. Nullable; only one pinned
    // post per author is enforced in the route layer (atomic clear-then-set in a tx).
    pinnedAt: timestamp('pinned_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    likeCount: integer('like_count').notNull().default(0),
    repostCount: integer('repost_count').notNull().default(0),
    replyCount: integer('reply_count').notNull().default(0),
    quoteCount: integer('quote_count').notNull().default(0),
    bookmarkCount: integer('bookmark_count').notNull().default(0),
    impressionCount: bigint('impression_count', { mode: 'number' }).notNull().default(0),
  },
  (t) => [
    check('posts_text_len', sql`char_length(${t.text}) <= 500`),
    index('posts_author_created_idx').on(t.authorId, t.createdAt).where(sql`${t.deletedAt} IS NULL`),
    index('posts_root_idx').on(t.rootId, t.createdAt),
    index('posts_reply_to_idx').on(t.replyToId),
    // Used when a user toggles a repost (find/decrement the existing repost row for this target).
    index('posts_repost_of_idx').on(t.repostOfId).where(sql`${t.repostOfId} IS NOT NULL AND ${t.deletedAt} IS NULL`),
    // Used for quote-count decrement on post delete and potential "quotes of this post" views.
    index('posts_quote_of_idx').on(t.quoteOfId).where(sql`${t.quoteOfId} IS NOT NULL`),
    index('posts_public_created_idx')
      .on(t.createdAt)
      .where(sql`${t.deletedAt} IS NULL AND ${t.visibility} = 'public'`),
    // Full-text search index on the post body, covers /api/search posts queries.
    index('posts_text_fts_idx')
      .using('gin', sql`to_tsvector('simple', ${t.text})`)
      .where(sql`${t.deletedAt} IS NULL AND ${t.visibility} = 'public'`),
    // Lookup pinned post per author (one expected, but indexed nonetheless).
    index('posts_author_pinned_idx').on(t.authorId).where(sql`${t.pinnedAt} IS NOT NULL`),
  ],
)

export const postEdits = pgTable(
  'post_edits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    postId: uuid('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    previousText: text('previous_text').notNull(),
    editedAt: timestamp('edited_at', { withTimezone: true }).notNull().defaultNow(),
    editedBy: uuid('edited_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (t) => [index('post_edits_post_idx').on(t.postId, t.editedAt)],
)

export const likes = pgTable(
  'likes',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    postId: uuid('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.postId] }),
    index('likes_post_idx').on(t.postId),
    // Supports For You fallback's network bucket: likes by followed users ordered by recency.
    index('likes_user_created_idx').on(t.userId, t.createdAt),
  ],
)

export const bookmarks = pgTable(
  'bookmarks',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    postId: uuid('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.postId] }),
    index('bookmarks_user_idx').on(t.userId, t.createdAt),
  ],
)

export const hashtags = pgTable('hashtags', {
  id: serial('id').primaryKey(),
  tag: citext('tag').notNull().unique(),
})

export const postHashtags = pgTable(
  'post_hashtags',
  {
    postId: uuid('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    hashtagId: integer('hashtag_id')
      .notNull()
      .references(() => hashtags.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.postId, t.hashtagId] }),
    index('post_hashtags_tag_idx').on(t.hashtagId, t.postId),
  ],
)

export const mentions = pgTable(
  'mentions',
  {
    postId: uuid('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    mentionedUserId: uuid('mentioned_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.postId, t.mentionedUserId] }),
    index('mentions_user_idx').on(t.mentionedUserId, t.postId),
  ],
)
