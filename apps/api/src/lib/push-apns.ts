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

const apnsSendConcurrency = 10

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
  const pushEnabledCache = new Map<string, boolean>()
  const jobsToSend: ApnsSendJob[] = []
  const uniquePreferenceJobs = new Map<string, ApnsSendJob>()

  for (const job of jobs) {
    const key = `${job.userId}:${job.kind}`
    if (!uniquePreferenceJobs.has(key)) uniquePreferenceJobs.set(key, job)
  }

  const preferenceJobs = Array.from(uniquePreferenceJobs.entries())
  for (let i = 0; i < preferenceJobs.length; i += apnsSendConcurrency) {
    const chunk = preferenceJobs.slice(i, i + apnsSendConcurrency)
    await Promise.allSettled(
      chunk.map(async ([key, job]) => {
        try {
          pushEnabledCache.set(
            key,
            await pushEnabledForUser(db, job.userId, job.kind)
          )
        } catch {
          pushEnabledCache.set(key, false)
        }
      })
    )
  }

  for (const job of jobs) {
    if (pushEnabledCache.get(`${job.userId}:${job.kind}`)) jobsToSend.push(job)
  }

  for (let i = 0; i < jobsToSend.length; i += apnsSendConcurrency) {
    const chunk = jobsToSend.slice(i, i + apnsSendConcurrency)
    await Promise.allSettled(chunk.map((job) => boss.send("apns.send", job)))
  }
}
