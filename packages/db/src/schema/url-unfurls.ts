import { index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { posts } from './posts.ts'

export const urlUnfurls = pgTable(
  'url_unfurls',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    url: text('url').notNull(),
    urlHash: text('url_hash').notNull(),
    // Normalized canonical key. Different URLs that mean the same thing (e.g. `?tab=readme`)
    // collapse to one row. Examples: `repo:facebook/react`, `pull:foo/bar#123`,
    // `commit:foo/bar@abcd123`, `generic:<sha256-of-canonical-url>`.
    refKey: text('ref_key'),
    // The semantic shape of the card. App-layer constrained: 'github_repo' | 'github_issue' |
    // 'github_pull' | 'github_commit' | 'generic'. String, not pg enum, so we can iterate.
    kind: text('kind'),
    // Lifecycle: 'pending' (row reserved, worker will populate) | 'ready' (populated) |
    // 'failed' (worker hit an error, retry after expiresAt) | 'unsupported' (we don't fetch
    // this URL — keeps a row so we don't keep retrying).
    state: text('state').notNull().default('pending'),
    title: text('title'),
    description: text('description'),
    imageUrl: text('image_url'),
    providerName: text('provider_name'),
    siteName: text('site_name'),
    card: jsonb('card'),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex('url_unfurls_hash_uq').on(t.urlHash),
    uniqueIndex('url_unfurls_ref_key_uq').on(t.refKey),
    index('url_unfurls_expires_idx').on(t.expiresAt),
    index('url_unfurls_state_idx').on(t.state),
  ],
)

// Many-to-many between posts and unfurls. A post can contain N URLs; the same URL can be
// referenced by many posts and we only fetch it once. `position` keeps render order stable.
export const postUrlUnfurls = pgTable(
  'post_url_unfurls',
  {
    postId: uuid('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    unfurlId: uuid('unfurl_id')
      .notNull()
      .references(() => urlUnfurls.id, { onDelete: 'cascade' }),
    position: integer('position').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.postId, t.unfurlId] }),
    index('post_url_unfurls_post_idx').on(t.postId, t.position),
    index('post_url_unfurls_unfurl_idx').on(t.unfurlId),
  ],
)
