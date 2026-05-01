import {
  and,
  ensureSystemReport,
  eq,
  finalizeScheduledDraftPublishInTx,
  inArray,
  isNotNull,
  isNull,
  lockScheduledDraftForPublish,
  lte,
  schema,
  SYSTEM_REPORT_BLOCKED_ATTEMPT,
  type Database,
} from '@workspace/db'
import { analyzePostPlaintext } from '@workspace/validators'
// Scan for due scheduled posts and publish them. Each row is published in its own transaction
// so a single failure doesn't stall the batch. Failed rows are marked with failedAt so they
// don't get retried indefinitely; the user can edit/delete them via the drafts page.
export async function publishDueScheduledPosts(db: Database, batchSize = 25): Promise<number> {
  const now = new Date()
  // Unlocked scan to find candidates. The actual row lock is taken inside publishOne's
  // transaction with FOR UPDATE SKIP LOCKED — that's the only place a lock is held long
  // enough to actually prevent two workers from grabbing the same row.
  const candidates = await db
    .select({ id: schema.scheduledPosts.id, authorId: schema.scheduledPosts.authorId })
    .from(schema.scheduledPosts)
    .where(
      and(
        isNotNull(schema.scheduledPosts.scheduledFor),
        lte(schema.scheduledPosts.scheduledFor, now),
        isNull(schema.scheduledPosts.publishedAt),
        isNull(schema.scheduledPosts.failedAt),
      ),
    )
    .orderBy(schema.scheduledPosts.scheduledFor)
    .limit(batchSize)

  if (candidates.length === 0) return 0

  let published = 0
  for (const row of candidates) {
    try {
      if (await publishOne(db, row.authorId, row.id)) published++
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      await db
        .update(schema.scheduledPosts)
        .set({ failedAt: new Date(), failureReason: reason })
        .where(eq(schema.scheduledPosts.id, row.id))
    }
  }
  return published
}

// Returns true if this call published the row, false if another worker beat us to it (or the
// row is no longer eligible). A return of false is not an error.
async function publishOne(db: Database, authorId: string, scheduledId: string): Promise<boolean> {
  return await db.transaction(async (tx) => {
    const draft = await lockScheduledDraftForPublish(tx, {
      authorId,
      scheduledId,
      skipLocked: true,
    })
    if (!draft) return false

    const mediaIds = draft.mediaIds ?? []
    if (mediaIds.length > 0) {
      const owned = await tx
        .select({ id: schema.media.id })
        .from(schema.media)
        .where(and(inArray(schema.media.id, [...mediaIds]), eq(schema.media.ownerId, authorId)))
      if (owned.length !== mediaIds.length) {
        throw new Error('invalid_media_ids')
      }
    }

    const policy = analyzePostPlaintext([draft.text])
    if (policy.action === 'block') {
      await ensureSystemReport(tx, {
        subjectType: 'user',
        subjectId: authorId,
        reason: 'illegal',
        details: SYSTEM_REPORT_BLOCKED_ATTEMPT,
      })
      await tx
        .update(schema.scheduledPosts)
        .set({ failedAt: new Date(), failureReason: 'content_policy_blocked' })
        .where(eq(schema.scheduledPosts.id, scheduledId))
      return false
    }

    const fileSlurReport = policy.action === 'flag'
    await finalizeScheduledDraftPublishInTx(tx, {
      authorId,
      draft,
      fileSlurSystemReport: fileSlurReport,
    })

    return true
  })
}
