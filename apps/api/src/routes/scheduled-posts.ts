import { Hono } from 'hono'
import {
  and,
  asc,
  assertScheduledMediaOwnership,
  desc,
  ensureSystemReport,
  eq,
  finalizeScheduledDraftPublishInTx,
  inArray,
  isNull,
  lockScheduledDraftForPublish,
  schema,
  sql,
  SYSTEM_REPORT_BLOCKED_ATTEMPT,
} from '@workspace/db'
import {
  analyzePostPlaintext,
  CONTENT_POLICY_BLOCKED_MESSAGE,
  createScheduledPostSchema,
  SCHEDULE_MIN_LEAD_SEC,
  SCHEDULE_MAX_LEAD_DAYS,
  updateScheduledPostSchema,
} from '@workspace/validators'
import { handleRateLimitError } from '@workspace/rate-limit'
import { requireHandle, type HonoEnv } from '../middleware/session.ts'
import { invalidateUnreadCounts } from '../lib/notify.ts'
import { homeFeedCacheKey } from './feed.ts'

export const scheduledPostsRoute = new Hono<HonoEnv>()

scheduledPostsRoute.use('*', requireHandle())

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
  const { db, rateLimit } = c.get('ctx')
  await rateLimit(c, 'scheduled.write')
  const body = createScheduledPostSchema.parse(await c.req.json())

  if (analyzePostPlaintext([body.text]).action === 'block') {
    throw new HttpError(422, 'content_policy_blocked', CONTENT_POLICY_BLOCKED_MESSAGE)
  }

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
  const { db, rateLimit } = c.get('ctx')
  await rateLimit(c, 'scheduled.write')
  const id = c.req.param('id')
  const body = updateScheduledPostSchema.parse(await c.req.json())

  if (body.text !== undefined && analyzePostPlaintext([body.text]).action === 'block') {
    throw new HttpError(422, 'content_policy_blocked', CONTENT_POLICY_BLOCKED_MESSAGE)
  }

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
  const { db, rateLimit } = c.get('ctx')
  await rateLimit(c, 'scheduled.write')
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
  const { db, cache, rateLimit } = c.get('ctx')
  await rateLimit(c, 'scheduled.write')
  const id = c.req.param('id')

  const result = await publishScheduled(db, session.user.id, id)
  if (!result.ok)
    return c.json(
      {
        error: result.error,
        ...(result.message !== undefined ? { message: result.message } : {}),
      },
      result.status as never,
    )

  await invalidateUnreadCounts(cache, result.notifyRecipients)
  await cache.del(homeFeedCacheKey(session.user.id))
  c.get('ctx').track('scheduled_post_published', session.user.id)
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

interface PublishSuccess {
  ok: true
  postId: string
  notifyRecipients: Set<string>
}
interface PublishError {
  ok: false
  status: number
  error: string
  message?: string
}

export async function publishScheduled(
  db: import('@workspace/db').Database,
  authorId: string,
  scheduledId: string,
): Promise<PublishSuccess | PublishError> {
  const result = await db.transaction(async (tx) => {
    const draft = await lockScheduledDraftForPublish(tx, {
      authorId,
      scheduledId,
      skipLocked: false,
    })
    if (!draft) return { ok: false as const, status: 404, error: 'not_found' as const }

    const mediaIds = draft.mediaIds ?? []
    const ownsMedia = await assertScheduledMediaOwnership(tx, authorId, mediaIds)
    if (!ownsMedia) return { ok: false as const, status: 400, error: 'invalid_media_ids' as const }

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

      return {
        ok: false as const,
        status: 422,
        error: 'content_policy_blocked' as const,
        message: CONTENT_POLICY_BLOCKED_MESSAGE,
      }
    }

    const fileSlurReport = policy.action === 'flag'
    const { postId, notifyRecipients } = await finalizeScheduledDraftPublishInTx(tx, {
      authorId,
      draft,
      fileSlurSystemReport: fileSlurReport,
    })

    return { ok: true as const, postId, notifyRecipients }
  })

  return result as PublishSuccess | PublishError
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
  constructor(
    public status: number,
    public code: string,
    public clientMessage?: string,
  ) {
    super(code)
  }
}

scheduledPostsRoute.onError((err, c) => {
  const rl = handleRateLimitError(err, c)
  if (rl) return rl
  if (err instanceof HttpError) {
    return c.json(
      {
        error: err.code,
        ...(err.clientMessage !== undefined ? { message: err.clientMessage } : {}),
      },
      err.status as never,
    )
  }
  console.error(err)
  return c.json({ error: 'internal_error', message: err.message }, 500)
})
