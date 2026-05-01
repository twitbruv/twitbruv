import { sql } from 'drizzle-orm'
import { boolean, bigint, customType, date, index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { userRoleEnum } from './enums.ts'

const citext = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'citext'
  },
})

const bytea = customType<{ data: Uint8Array; driverData: Buffer }>({
  dataType() {
    return 'bytea'
  },
})

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    emailVerified: boolean('email_verified').notNull().default(false),
    name: text('name'),
    image: text('image'),

    // Nullable: email/password signups set it via the /api/me/handle claim flow after
    // signin; OAuth signups collect it via a "choose your handle" step post-login.
    handle: citext('handle'),
    displayName: text('display_name'),
    bio: text('bio'),
    location: text('location'),
    websiteUrl: text('website_url'),
    bannerUrl: text('banner_url'),
    avatarUrl: text('avatar_url'),
    birthday: date('birthday'),
    isVerified: boolean('is_verified').notNull().default(false),
    isBot: boolean('is_bot').notNull().default(false),
    role: userRoleEnum('role').notNull().default('user'),
    locale: text('locale').notNull().default('en'),
    timezone: text('timezone'),
    shadowBannedAt: timestamp('shadow_banned_at', { withTimezone: true }),
    signupIpHash: bytea('signup_ip_hash'),
    twoFactorEnabled: boolean('two_factor_enabled').notNull().default(false),
    // ActivityPub identity. Generated lazily on first inbound federation request so existing
    // local-only users don't all need a backfill. Public key is exposed in the actor JSON;
    // private key signs outbound activities.
    apPublicKeyPem: text('ap_public_key_pem'),
    apPrivateKeyPem: text('ap_private_key_pem'),
    // admin plugin (better-auth)
    banned: boolean('banned').notNull().default(false),
    banReason: text('ban_reason'),
    banExpires: timestamp('ban_expires', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('users_handle_uq').on(t.handle),
    uniqueIndex('users_email_uq').on(t.email),
    index('users_created_at_idx').on(t.createdAt),
    // Trigram GIN indexes for ilike '%q%' search. Without these, /api/search and the admin
    // user list table-scan once the users table is large. pg_trgm is enabled by init SQL.
    index('users_handle_trgm_idx')
      .using('gin', sql`${t.handle} gin_trgm_ops`)
      .where(sql`${t.handle} IS NOT NULL`),
    index('users_email_trgm_idx').using('gin', sql`${t.email} gin_trgm_ops`),
    index('users_display_name_trgm_idx')
      .using('gin', sql`${t.displayName} gin_trgm_ops`)
      .where(sql`${t.displayName} IS NOT NULL`),
  ],
)

export const profilePrivate = pgTable('profile_private', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  phone: text('phone'),
  pushSubscriptions: jsonb('push_subscriptions'),
  notificationPrefs: jsonb('notification_prefs'),
  analyticsOptOut: boolean('analytics_opt_out').notNull().default(false),
})

// ---- better-auth tables ----
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: text('token').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    // admin plugin: impersonation support
    impersonatedBy: text('impersonated_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('sessions_token_uq').on(t.token), index('sessions_user_idx').on(t.userId)],
)

export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    providerId: text('provider_id').notNull(),
    accountId: text('account_id').notNull(),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('accounts_provider_account_uq').on(t.providerId, t.accountId),
    index('accounts_user_idx').on(t.userId),
  ],
)

export const verifications = pgTable(
  'verifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('verifications_identifier_idx').on(t.identifier)],
)

export const passkeys = pgTable(
  'passkeys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name'),
    publicKey: text('public_key').notNull(),
    credentialID: text('credential_id').notNull(),
    counter: bigint('counter', { mode: 'number' }).notNull().default(0),
    deviceType: text('device_type').notNull().default('unknown'),
    backedUp: boolean('backed_up').notNull().default(false),
    transports: text('transports'),
    aaguid: text('aaguid'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('passkeys_credential_uq').on(t.credentialID),
    index('passkeys_user_idx').on(t.userId),
  ],
)

export const twoFactors = pgTable(
  'two_factors',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    secret: text('secret').notNull(),
    backupCodes: text('backup_codes'),
    verified: boolean('verified').notNull().default(false),
  },
  (t) => [index('two_factors_user_idx').on(t.userId)],
)

// helpful for partial index usage: expose sql helper
export const _sqlNow = sql`now()`
