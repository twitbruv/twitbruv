import { schema } from "@workspace/db"
import type { Transaction } from "@workspace/db"
import type { Cache } from "./cache.ts"

export type NotificationKind =
  | "like"
  | "repost"
  | "reply"
  | "mention"
  | "follow"
  | "dm"
  | "article_reply"
  | "quote"

export interface NotifyPushPayload {
  title: string
  body: string
  deepLink: string
}

export interface NotifyInput {
  userId: string
  actorId: string
  kind: NotificationKind
  entityType?: "post" | "article" | "conversation"
  entityId?: string
  push?: NotifyPushPayload
}

export interface ApnsSendJob {
  userId: string
  kind: NotificationKind
  title: string
  body: string
  deepLink: string
}

export interface NotifyResult {
  recipients: Set<string>
  pushJobs: ApnsSendJob[]
}

export async function notify(
  tx: Transaction,
  inputs: Array<NotifyInput>
): Promise<NotifyResult> {
  const filtered = inputs.filter((n) => n.actorId !== n.userId)
  const rows = filtered.map((n) => ({
    userId: n.userId,
    actorId: n.actorId,
    kind: n.kind,
    entityType: n.entityType ?? null,
    entityId: n.entityId ?? null,
  }))
  const pushJobs: ApnsSendJob[] = filtered
    .filter((n) => n.push)
    .map((n) => ({
      userId: n.userId,
      kind: n.kind,
      title: n.push!.title,
      body: n.push!.body,
      deepLink: n.push!.deepLink,
    }))
  if (rows.length === 0) return { recipients: new Set(), pushJobs: [] }
  await tx.insert(schema.notifications).values(rows)
  return {
    recipients: new Set(rows.map((r) => r.userId)),
    pushJobs,
  }
}

export function notificationsUnreadCacheKey(userId: string) {
  return `notif:unread:${userId}:v1`
}

export async function invalidateUnreadCounts(
  cache: Cache,
  userIds: Set<string> | Array<string>
) {
  const ids = Array.from(userIds)
  if (ids.length === 0) return
  await cache.del(...ids.map(notificationsUnreadCacheKey))
}
