import { and, eq, inArray, isNotNull, isNull, lte, schema } from '@workspace/db'
import type { Database } from '@workspace/db'

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
    // SKIP LOCKED: if another worker already holds this row, bail — we'll see it next scan
    // if it's still due. The eligibility filters are re-checked under the lock to handle the
    // case where it was published or failed between the outer scan and now.
    const [draft] = await tx
      .select()
      .from(schema.scheduledPosts)
      .where(
        and(
          eq(schema.scheduledPosts.id, scheduledId),
          eq(schema.scheduledPosts.authorId, authorId),
          isNull(schema.scheduledPosts.publishedAt),
          isNull(schema.scheduledPosts.failedAt),
        ),
      )
      .limit(1)
      .for('update', { skipLocked: true })
    if (!draft) return false

    const [post] = await tx
      .insert(schema.posts)
      .values({
        authorId,
        text: draft.text,
        visibility: draft.visibility,
        replyRestriction: draft.replyRestriction,
        sensitive: draft.sensitive,
        contentWarning: draft.contentWarning,
      })
      .returning()
    if (!post) throw new Error('insert_failed')

    if (draft.mediaIds && draft.mediaIds.length > 0) {
      const owned = await tx
        .select({ id: schema.media.id })
        .from(schema.media)
        .where(
          and(inArray(schema.media.id, draft.mediaIds), eq(schema.media.ownerId, authorId)),
        )
      if (owned.length !== draft.mediaIds.length) {
        throw new Error('invalid_media_ids')
      }
      await tx.insert(schema.postMedia).values(
        draft.mediaIds.map((mediaId, position) => ({ postId: post.id, mediaId, position })),
      )
    }

    await tx
      .update(schema.scheduledPosts)
      .set({ publishedAt: new Date(), publishedPostId: post.id })
      .where(eq(schema.scheduledPosts.id, scheduledId))

    return true
  })
}
