import { and, eq, inArray, isNull, lte, schema, sql } from '@workspace/db'
import type { Database } from '@workspace/db'

// Scan for due scheduled posts and publish them. Each row is published in its own transaction
// so a single failure doesn't stall the batch. Failed rows are marked with failedAt so they
// don't get retried indefinitely; the user can edit/delete them via the drafts page.
export async function publishDueScheduledPosts(db: Database, batchSize = 25): Promise<number> {
  const now = new Date()
  // SELECT FOR UPDATE SKIP LOCKED so multiple workers can run safely without double-publishing.
  const due = await db.execute(sql`
    SELECT id, author_id
    FROM ${schema.scheduledPosts}
    WHERE scheduled_for IS NOT NULL
      AND scheduled_for <= ${now}
      AND published_at IS NULL
      AND failed_at IS NULL
    ORDER BY scheduled_for ASC
    LIMIT ${batchSize}
    FOR UPDATE SKIP LOCKED
  `)

  const rows = due as unknown as Array<{ id: string; author_id: string }>
  if (rows.length === 0) return 0

  let published = 0
  for (const row of rows) {
    try {
      await publishOne(db, row.author_id, row.id)
      published++
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

async function publishOne(db: Database, authorId: string, scheduledId: string) {
  await db.transaction(async (tx) => {
    const [draft] = await tx
      .select()
      .from(schema.scheduledPosts)
      .where(
        and(
          eq(schema.scheduledPosts.id, scheduledId),
          eq(schema.scheduledPosts.authorId, authorId),
          isNull(schema.scheduledPosts.publishedAt),
        ),
      )
      .limit(1)
    if (!draft) throw new Error('draft_disappeared')

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
  })
}
