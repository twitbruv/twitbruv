import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  customType,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { users } from './auth.ts'
import { posts } from './posts.ts'

const citext = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'citext'
  },
})

// Membership roles in a community. The owner is also stored as a member with
// role='owner'; we keep a denormalized owner_id on the community for fast
// permission checks but the row in community_members is authoritative.
export const communityRoleEnum = pgEnum('community_role', ['owner', 'mod', 'member'])

export const communityVisibilityEnum = pgEnum('community_visibility', [
  // Anyone can read; anyone can request to join. Posts inside the community
  // are also visible to non-members for browsing.
  'public',
  // Anyone can read; only invited users can join and post.
  'restricted',
  // Only members can read or post; the community surface still 404s for
  // non-members at the API layer.
  'private',
])

export const communities = pgTable(
  'communities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: citext('slug').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    avatarUrl: text('avatar_url'),
    bannerUrl: text('banner_url'),
    visibility: communityVisibilityEnum('visibility').notNull().default('public'),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    memberCount: integer('member_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('communities_slug_uq').on(t.slug),
    index('communities_owner_idx').on(t.ownerId, t.createdAt),
    check('communities_slug_format', sql`${t.slug} ~ '^[a-z0-9-]{2,40}$'`),
    check('communities_name_len', sql`char_length(${t.name}) BETWEEN 1 AND 80`),
  ],
)

export const communityMembers = pgTable(
  'community_members',
  {
    communityId: uuid('community_id')
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: communityRoleEnum('role').notNull().default('member'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
    // Set when the user has an outstanding join request for a 'restricted'
    // community. The owner / mods accept by clearing this and ensuring role
    // is 'member'.
    pendingApproval: boolean('pending_approval').notNull().default(false),
  },
  (t) => [
    primaryKey({ columns: [t.communityId, t.userId] }),
    index('community_members_user_idx').on(t.userId),
    index('community_members_pending_idx')
      .on(t.communityId)
      .where(sql`${t.pendingApproval} = true`),
  ],
)

// Many-to-many between posts and communities. A post can be cross-posted to
// multiple communities, but for v1 the API enforces "one community per post"
// so the relation stays simple (the table is still a join table for forward
// compat).
export const communityPosts = pgTable(
  'community_posts',
  {
    communityId: uuid('community_id')
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    postId: uuid('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.communityId, t.postId] }),
    index('community_posts_community_added_idx').on(t.communityId, t.addedAt),
    uniqueIndex('community_posts_post_uq').on(t.postId),
  ],
)
