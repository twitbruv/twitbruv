import { and, eq, inArray, isNull } from 'drizzle-orm'

import type { NotifyInsertRow } from './notify-insert.ts'
import { insertNotifications } from './notify-insert.ts'
import { linkHashtags, linkMentions } from './post-linking.ts'
import * as schema from './schema/index.ts'
import { ensureSystemReport, SYSTEM_REPORT_SLUR_HIT } from './system-report.ts'

export type ScheduledPostRow = typeof schema.scheduledPosts.$inferSelect

/**
 * Inserts posts + post_media, links hashtags & mentions, optional system slur report,
 * marks scheduled_posts published. Notifications for @mentions only.
 */
export async function finalizeScheduledDraftPublishInTx(
  tx: any,
  params: {
    authorId: string
    draft: ScheduledPostRow
    /** Author id must own all draft.mediaIds (caller validates unless empty). */
    fileSlurSystemReport?: boolean
  },
): Promise<{ postId: string; notifyRecipients: Set<string> }> {
  const { authorId, draft } = params
  const mediaIds = draft.mediaIds ?? []

  const [post] = await tx
    .insert(schema.posts)
    .values({
      authorId,
      text: draft.text,
      visibility: draft.visibility,
      replyRestriction: draft.replyRestriction,
      sensitive: draft.sensitive,
      contentWarning: draft.contentWarning ?? null,
    })
    .returning({ id: schema.posts.id })
  if (!post) throw new Error('insert_failed')

  if (mediaIds.length > 0) {
    await tx.insert(schema.postMedia).values(
      mediaIds.map((mediaId: string, position: number) => ({
        postId: post.id,
        mediaId,
        position,
      })),
    )
  }

  await linkHashtags(tx, post.id, draft.text)
  const mentionedUserIds = await linkMentions(tx, post.id, authorId, draft.text)

  const mentionsNotify: Array<NotifyInsertRow> = mentionedUserIds.map((userId) => ({
    userId,
    actorId: authorId,
    kind: 'mention',
    entityType: 'post',
    entityId: post.id,
  }))
  const notifyRecipients = await insertNotifications(tx, mentionsNotify)

  if (params.fileSlurSystemReport) {
    await ensureSystemReport(tx, {
      subjectType: 'post',
      subjectId: post.id,
      reason: 'harassment',
      details: SYSTEM_REPORT_SLUR_HIT,
    })
  }

  await tx
    .update(schema.scheduledPosts)
    .set({ publishedAt: new Date(), publishedPostId: post.id })
    .where(eq(schema.scheduledPosts.id, draft.id))

  return { postId: post.id, notifyRecipients }
}

/** Lock and load an eligible draft. Worker uses SKIP LOCKED; API applies a normal row lock. */
export async function lockScheduledDraftForPublish(
  tx: any,
  opts: {
    authorId: string
    scheduledId: string
    skipLocked?: boolean
  },
): Promise<ScheduledPostRow | undefined> {
  const filter = and(
    eq(schema.scheduledPosts.id, opts.scheduledId),
    eq(schema.scheduledPosts.authorId, opts.authorId),
    isNull(schema.scheduledPosts.publishedAt),
    isNull(schema.scheduledPosts.failedAt),
  )
  const base = tx.select().from(schema.scheduledPosts).where(filter).limit(1)
  const [draft] = opts.skipLocked
    ? await base.for('update', { skipLocked: true })
    : await base.for('update')
  return draft
}

export async function assertScheduledMediaOwnership(
  tx: any,
  authorId: string,
  mediaIds: ReadonlyArray<string>,
): Promise<boolean> {
  if (mediaIds.length === 0) return true
  const owned = await tx
    .select({ id: schema.media.id })
    .from(schema.media)
    .where(and(inArray(schema.media.id, [...mediaIds]), eq(schema.media.ownerId, authorId)))
  return owned.length === mediaIds.length
}
