import * as schema from './schema/index.ts'

export type NotificationKindInsert =
  | 'like'
  | 'repost'
  | 'reply'
  | 'mention'
  | 'follow'
  | 'dm'
  | 'article_reply'
  | 'quote'

export interface NotifyInsertRow {
  userId: string
  actorId: string
  kind: NotificationKindInsert
  entityType?: 'post' | 'article' | 'conversation'
  entityId?: string
}

/**
 * Insert one or more notification rows in a single statement. Call within the same
 * transaction as the causing write. Self-notifications (actor == recipient) are dropped.
 */
export async function insertNotifications(tx: any, inputs: Array<NotifyInsertRow>): Promise<Set<string>> {
  const rows = inputs
    .filter((n) => n.actorId !== n.userId)
    .map((n) => ({
      userId: n.userId,
      actorId: n.actorId,
      kind: n.kind,
      entityType: n.entityType ?? null,
      entityId: n.entityId ?? null,
    }))
  if (rows.length === 0) return new Set()
  await tx.insert(schema.notifications).values(rows)
  return new Set(rows.map((r) => r.userId))
}
