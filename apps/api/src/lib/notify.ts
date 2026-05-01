import { insertNotifications } from '@workspace/db'
import type { Cache } from './cache.ts'

export type NotificationKind =
  | 'like'
  | 'repost'
  | 'reply'
  | 'mention'
  | 'follow'
  | 'dm'
  | 'article_reply'
  | 'quote'

export interface NotifyInput {
  userId: string
  actorId: string
  kind: NotificationKind
  entityType?: 'post' | 'article' | 'conversation'
  entityId?: string
}

/**
 * Insert one or more notification rows in a single statement. Callers should invoke this
 * within the same transaction as the causing write so notifications can't get orphaned.
 * Self-notifications (actor == recipient) are filtered inside insertNotifications.
 */
export async function notify(tx: any, inputs: Array<NotifyInput>): Promise<Set<string>> {
  return insertNotifications(tx, inputs)
}

/** Redis key for the cached unread-notification count. */
export function notificationsUnreadCacheKey(userId: string) {
  return `notif:unread:${userId}:v1`
}

/**
 * Bust the cached unread-count for the given recipients. Call this AFTER the surrounding
 * transaction commits — on rollback we'd otherwise clobber a still-correct cached value.
 * No-op for empty sets.
 */
export async function invalidateUnreadCounts(cache: Cache, userIds: Set<string> | Array<string>) {
  const ids = Array.from(userIds)
  if (ids.length === 0) return
  await cache.del(...ids.map(notificationsUnreadCacheKey))
}
