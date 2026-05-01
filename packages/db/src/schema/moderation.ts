import { index, integer, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { users } from './auth.ts'
import { modActionEnum, reportReasonEnum, reportStatusEnum } from './enums.ts'

export const reports = pgTable(
  'reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Null for automated (system) reports filed by moderation policy.
    reporterId: uuid('reporter_id').references(() => users.id, { onDelete: 'cascade' }),
    subjectType: text('subject_type').notNull(),
    subjectId: uuid('subject_id').notNull(),
    reason: reportReasonEnum('reason').notNull(),
    details: text('details'),
    status: reportStatusEnum('status').notNull().default('open'),
    assignedToId: uuid('assigned_to_id').references(() => users.id, { onDelete: 'set null' }),
    resolutionNote: text('resolution_note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (t) => [
    index('reports_status_idx').on(t.status, t.createdAt),
    index('reports_subject_idx').on(t.subjectType, t.subjectId),
  ],
)

export const moderationActions = pgTable(
  'moderation_actions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    moderatorId: uuid('moderator_id').references(() => users.id, { onDelete: 'set null' }),
    subjectType: text('subject_type').notNull(),
    subjectId: uuid('subject_id').notNull(),
    action: modActionEnum('action').notNull(),
    reasonTemplate: text('reason_template'),
    publicReason: text('public_reason'),
    privateNote: text('private_note'),
    reportId: uuid('report_id').references(() => reports.id, { onDelete: 'set null' }),
    durationHours: integer('duration_hours'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('moderation_actions_subject_idx').on(t.subjectType, t.subjectId, t.createdAt)],
)

export const csamHashes = pgTable('csam_hashes', {
  hashHex: text('hash_hex').primaryKey(),
  source: text('source'),
  addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
})

export const rateLimitViolations = pgTable(
  'rate_limit_violations',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    ruleKey: text('rule_key').notNull(),
    count: integer('count').notNull().default(0),
    windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.ruleKey, t.windowStart] })],
)
