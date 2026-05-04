import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
import { users } from "./auth.ts"
import { apnsEnvironmentEnum } from "./enums.ts"

export const deviceTokens = pgTable(
  "device_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    bundleId: text("bundle_id").notNull(),
    environment: apnsEnvironmentEnum("environment").notNull(),
    appVersion: text("app_version"),
    osVersion: text("os_version"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("device_tokens_token_env_uq").on(t.token, t.environment),
    index("device_tokens_user_idx").on(t.userId),
  ]
)
