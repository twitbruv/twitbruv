import type PgBoss from "pg-boss"
import { eq, schema } from "@workspace/db"
import type { Database } from "@workspace/db"
import type { ApnsSendJob, NotificationKind } from "./notify.ts"

export function postPermalink(
  webUrl: string,
  authorHandle: string | null | undefined,
  postId: string
): string {
  const base = webUrl.replace(/\/$/, "")
  const h = (authorHandle ?? "_").replace(/^@/, "")
  return `${base}/${h}/p/${postId}`
}

export function profilePermalink(
  webUrl: string,
  handle: string | null | undefined
): string {
  const base = webUrl.replace(/\/$/, "")
  const h = (handle ?? "_").replace(/^@/, "")
  return `${base}/${h}`
}

export function inboxPermalink(webUrl: string, conversationId: string): string {
  const base = webUrl.replace(/\/$/, "")
  return `${base}/inbox/${conversationId}`
}

const defaultPushPrefs: Partial<Record<NotificationKind, boolean>> = {
  like: false,
  repost: false,
  reply: true,
  mention: true,
  follow: true,
  dm: true,
  article_reply: true,
  quote: true,
}

async function pushEnabledForUser(
  db: Database,
  userId: string,
  kind: NotificationKind
): Promise<boolean> {
  const def = defaultPushPrefs[kind] ?? true
  const [row] = await db
    .select({ notificationPrefs: schema.profilePrivate.notificationPrefs })
    .from(schema.profilePrivate)
    .where(eq(schema.profilePrivate.userId, userId))
    .limit(1)
  const raw = row?.notificationPrefs
  if (!raw || typeof raw !== "object" || raw === null) return def
  const prefs = raw as { push?: Record<string, boolean> }
  const v = prefs.push?.[kind]
  if (typeof v === "boolean") return v
  return def
}

export async function enqueueApnsSendJobs(
  boss: PgBoss,
  db: Database,
  jobs: ApnsSendJob[]
): Promise<void> {
  for (const job of jobs) {
    if (!(await pushEnabledForUser(db, job.userId, job.kind))) continue
    await boss.send("apns.send", job)
  }
}
