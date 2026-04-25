import { sql } from 'drizzle-orm'
import { boolean, check, customType, index, integer, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { users } from './auth.ts'

const citext = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'citext'
  },
})

// User-curated lists. Each list belongs to one owner and has a slug unique within that owner.
// Public lists can be viewed by anyone; private lists are only visible to the owner.
export const userLists = pgTable(
  'user_lists',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    slug: citext('slug').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    isPrivate: boolean('is_private').notNull().default(false),
    memberCount: integer('member_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('user_lists_owner_slug_uq').on(t.ownerId, t.slug),
    index('user_lists_owner_idx').on(t.ownerId, t.createdAt),
    check('user_lists_title_len', sql`char_length(${t.title}) BETWEEN 1 AND 60`),
    check('user_lists_slug_format', sql`${t.slug} ~ '^[a-z0-9-]{1,40}$'`),
  ],
)

export const userListMembers = pgTable(
  'user_list_members',
  {
    listId: uuid('list_id')
      .notNull()
      .references(() => userLists.id, { onDelete: 'cascade' }),
    memberId: uuid('member_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.listId, t.memberId] }),
    // For "what lists is this user on" lookups (used on profiles).
    index('user_list_members_member_idx').on(t.memberId),
  ],
)
