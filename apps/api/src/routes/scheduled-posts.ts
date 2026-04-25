import { Hono } from 'hono'
import { and, asc, desc, eq, inArray, isNull, schema, sql } from '@workspace/db'
import {
  createScheduledPostSchema,
  updateScheduledPostSchema,
  SCHEDULE_MIN_LEAD_SEC,
  SCHEDULE_MAX_LEAD_DAYS,
} from '@workspace/validators'
import { requireAuth, type HonoEnv } from '../middleware/session.ts'
import { linkHashtags } from '../lib/hashtags.ts'
import { linkMentions } from '../lib/mentions.ts'
import { notify } from '../lib/notify.ts'
import { homeFeedCacheKey } from './feed.ts'

export const scheduledPostsRoute = new Hono<HonoEnv>()

scheduledPostsRoute.use('*', requireAuth())

// List the viewer's drafts and/or scheduled posts.
// ?kind=draft → only drafts (scheduledFor IS NULL)
// ?kind=scheduled → only scheduled (scheduledFor IS NOT NULL)
// default → both, drafts first
scheduledPostsRoute.get('/', async (c) => {
  const session = c.get('session')!
  const { db } = c.get('ctx')
  const kind = c.req.query('kind')

  const rows = await db
    .select()
    .from(schema.scheduledPosts)
    .where(
      and(
        eq(schema.scheduledPosts.authorId, session.user.id),
        isNull(schema.scheduledPosts.publishedAt),
        kind === 'draft' ? sql`${schema.scheduledPosts.scheduledFor} IS NULL` : undefined,
        kind === 'scheduled' ? sql`${schema.scheduledPosts.scheduledFor} IS NOT NULL` : undefined,
      ),
    )
    .orderBy(asc(schema.scheduledPosts.scheduledFor), desc(schema.scheduledPosts.createdAt))

  return c.json({ items: rows.map(toDto) })
})

scheduledPostsRoute.post('/', async (c) => {
  const session = c.get('session')!
  const { db } = c.get('ctx')
  const body = createScheduledPostSchema.parse(await c.req.json())

  validateSchedule(body.scheduledFor)

  if (body.mediaIds && body.mediaIds.length > 0) {
    await assertMediaOwnership(db, session.user.id, body.mediaIds)
  }

  const [row] = await db
    .insert(schema.scheduledPosts)
    .values({
      authorId: session.user.id,
      text: body.text,
      mediaIds: body.mediaIds ?? [],
      visibility: body.visibility,
      replyRestriction: body.replyRestriction,
      sensitive: body.sensitive,
      contentWarning: body.contentWarning,
      scheduledFor: body.scheduledFor ? new Date(body.scheduledFor) : null,
    })
    .returning()
  if (!row) return c.json({ error: 'insert_failed' }, 500)
  return c.json({ item: toDto(row) }, 201)
})

scheduledPostsRoute.patch('/:id', async (c) => {
  const session = c.get('session')!
  const { db } = c.get('ctx')
  const id = c.req.param('id')
  const body = updateScheduledPostSchema.parse(await c.req.json())

  if (body.scheduledFor !== undefined) validateSchedule(body.scheduledFor)
  if (body.mediaIds && body.mediaIds.length > 0) {
    await assertMediaOwnership(db, session.user.id, body.mediaIds)
  }

  const patch: Partial<typeof schema.scheduledPosts.$inferInsert> = {
    updatedAt: new Date(),
  }
  if (body.text !== undefined) patch.text = body.text
  if (body.mediaIds !== undefined) patch.mediaIds = body.mediaIds
  if (body.visibility !== undefined) patch.visibility = body.visibility
  if (body.replyRestriction !== undefined) patch.replyRestriction = body.replyRestriction
  if (body.sensitive !== undefined) patch.sensitive = body.sensitive
  if (body.contentWarning !== undefined) patch.contentWarning = body.contentWarning ?? null
  if (body.scheduledFor !== undefined) {
    patch.scheduledFor = body.scheduledFor ? new Date(body.scheduledFor) : null
  }

  const [row] = await db
    .update(schema.scheduledPosts)
    .set(patch)
    .where(
      and(
        eq(schema.scheduledPosts.id, id),
        eq(schema.scheduledPosts.authorId, session.user.id),
        isNull(schema.scheduledPosts.publishedAt),
      ),
    )
    .returning()
  if (!row) return c.json({ error: 'not_found' }, 404)
  return c.json({ item: toDto(row) })
})

scheduledPostsRoute.delete('/:id', async (c) => {
  const session = c.get('session')!
  const { db } = c.get('ctx')
  const id = c.req.param('id')
  await db
    .delete(schema.scheduledPosts)
    .where(
      and(
        eq(schema.scheduledPosts.id, id),
        eq(schema.scheduledPosts.authorId, session.user.id),
        isNull(schema.scheduledPosts.publishedAt),
      ),
    )
  return c.json({ ok: true })
})

// Publish a draft / scheduled post immediately, regardless of scheduledFor. Used by the "Post
// now" UI button on the drafts page, and by the worker when scheduledFor lapses.
scheduledPostsRoute.post('/:id/publish', async (c) => {
  const session = c.get('session')!
  const { db, cache } = c.get('ctx')
  const id = c.req.param('id')

  const result = await publishScheduled(db, session.user.id, id)
  if (!result.ok) return c.json({ error: result.error }, result.status as never)

  await cache.del(homeFeedCacheKey(session.user.id))
  return c.json({ postId: result.postId })
})

function validateSchedule(scheduledFor: string | null | undefined) {
  if (!scheduledFor) return
  const t = new Date(scheduledFor).getTime()
  if (!Number.isFinite(t)) throw new HttpError(400, 'invalid_schedule')
  const now = Date.now()
  if (t - now < SCHEDULE_MIN_LEAD_SEC * 1000) throw new HttpError(400, 'schedule_too_soon')
  if (t - now > SCHEDULE_MAX_LEAD_DAYS * 24 * 3600 * 1000) {
    throw new HttpError(400, 'schedule_too_far')
  }
}

async function assertMediaOwnership(
  db: import('@workspace/db').Database,
  ownerId: string,
  ids: Array<string>,
) {
  const owned = await db
    .select({ id: schema.media.id })
    .from(schema.media)
    .where(and(inArray(schema.media.id, ids), eq(schema.media.ownerId, ownerId)))
  if (owned.length !== ids.length) throw new HttpError(400, 'invalid_media_ids')
}

interface PublishResult {
  ok: true
  postId: string
}
interface PublishError {
  ok: false
  status: number
  error: string
}

// Shared publishing logic used by the API endpoint and by the worker job. The author check
// is enforced by callers (worker passes the row's authorId, the API passes the session user).
export async function publishScheduled(
  db: import('@workspace/db').Database,
  authorId: string,
  scheduledId: string,
): Promise<PublishResult | PublishError> {
  return await db.transaction(async (tx) => {
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
    if (!draft) return { ok: false, status: 404, error: 'not_found' as const }

    if (draft.mediaIds && draft.mediaIds.length > 0) {
      const owned = await tx
        .select({ id: schema.media.id })
        .from(schema.media)
        .where(
          and(inArray(schema.media.id, draft.mediaIds), eq(schema.media.ownerId, authorId)),
        )
      if (owned.length !== draft.mediaIds.length) {
        return { ok: false, status: 400, error: 'invalid_media_ids' as const }
      }
    }

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
    if (!post) return { ok: false, status: 500, error: 'insert_failed' as const }

    if (draft.mediaIds && draft.mediaIds.length > 0) {
      await tx.insert(schema.postMedia).values(
        draft.mediaIds.map((mediaId, position) => ({ postId: post.id, mediaId, position })),
      )
    }

    await linkHashtags(tx, post.id, post.text)
    const mentioned = await linkMentions(tx, post.id, authorId, post.text)
    await notify(
      tx,
      mentioned.map((uid) => ({
        userId: uid,
        actorId: authorId,
        kind: 'mention' as const,
        entityType: 'post',
        entityId: post.id,
      })),
    )

    await tx
      .update(schema.scheduledPosts)
      .set({ publishedAt: new Date(), publishedPostId: post.id })
      .where(eq(schema.scheduledPosts.id, scheduledId))

    return { ok: true, postId: post.id }
  })
}

function toDto(row: typeof schema.scheduledPosts.$inferSelect) {
  return {
    id: row.id,
    text: row.text,
    mediaIds: row.mediaIds ?? [],
    visibility: row.visibility,
    replyRestriction: row.replyRestriction,
    sensitive: row.sensitive,
    contentWarning: row.contentWarning,
    scheduledFor: row.scheduledFor?.toISOString() ?? null,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    publishedPostId: row.publishedPostId,
    failedAt: row.failedAt?.toISOString() ?? null,
    failureReason: row.failureReason,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

class HttpError extends Error {
  constructor(public status: number, public code: string) {
    super(code)
  }
}

scheduledPostsRoute.onError((err, c) => {
  if (err instanceof HttpError) return c.json({ error: err.code }, err.status as never)
  console.error(err)
  return c.json({ error: 'internal_error', message: err.message }, 500)
})
