import { Hono } from 'hono'
import { z } from 'zod'
import { and, eq } from '@workspace/db'
import { schema } from '@workspace/db'
import { headObject, presignPut, publicUrl, type S3 } from '@workspace/media/s3'
import type { MediaEnv } from '@workspace/media/env'
import type { AppJobQueues } from '../lib/job-queues.ts'
import { requireHandle, type HonoEnv } from '../middleware/session.ts'

export interface MediaDeps {
  s3: S3
  mediaEnv: MediaEnv
  jobQueues: AppJobQueues
}

const MAX_IMAGE_BYTES = 15 * 1024 * 1024
const ALLOWED_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/gif',
  'image/heic',
  'image/heif',
])

const intentSchema = z.object({
  mime: z.string(),
  size: z.number().int().min(1).max(MAX_IMAGE_BYTES),
})

export function createMediaRoute(deps: MediaDeps) {
  const route = new Hono<HonoEnv>()

  route.post('/intent', requireHandle(), async (c) => {
    const session = c.get('session')!
    const { db, rateLimit } = c.get('ctx')
    await rateLimit(c, 'media.upload')
    const body = intentSchema.parse(await c.req.json())

    if (!ALLOWED_IMAGE_MIMES.has(body.mime)) {
      return c.json({ error: 'unsupported_mime' }, 415)
    }

    const ext = body.mime === 'image/jpeg' ? 'jpg' : body.mime.split('/')[1]
    const [inserted] = await db
      .insert(schema.media)
      .values({
        ownerId: session.user.id,
        kind: body.mime === 'image/gif' ? 'gif' : 'image',
        originalKey: 'pending',
        mimeType: body.mime,
        bytes: body.size,
      })
      .returning()
    if (!inserted) return c.json({ error: 'insert_failed' }, 500)

    const key = `originals/${session.user.id}/${inserted.id}/original.${ext}`
    await db.update(schema.media).set({ originalKey: key }).where(eq(schema.media.id, inserted.id))

    const presigned = await presignPut({
      s3: deps.s3,
      bucket: deps.mediaEnv.S3_BUCKET,
      key,
      contentType: body.mime,
      contentLength: body.size,
    })

    return c.json({
      mediaId: inserted.id,
      uploadUrl: presigned.url,
      uploadHeaders: presigned.headers,
      maxBytes: MAX_IMAGE_BYTES,
    })
  })

  route.post('/:id/finalize', requireHandle(), async (c) => {
    const session = c.get('session')!
    const { db } = c.get('ctx')
    const id = c.req.param('id')

    const [media] = await db
      .select()
      .from(schema.media)
      .where(and(eq(schema.media.id, id), eq(schema.media.ownerId, session.user.id)))
      .limit(1)
    if (!media) return c.json({ error: 'not_found' }, 404)

    const head = await headObject(deps.s3, deps.mediaEnv.S3_BUCKET, media.originalKey)
    if (!head.exists) return c.json({ error: 'upload_not_found' }, 400)

    await db
      .update(schema.media)
      .set({ processingState: 'processing', bytes: head.contentLength ?? media.bytes })
      .where(eq(schema.media.id, id))

    await deps.jobQueues.enqueueMediaProcess({ mediaId: id })

    return c.json({ mediaId: id, processing: true })
  })

  route.get('/:id', async (c) => {
    const { db } = c.get('ctx')
    const id = c.req.param('id')
    const [media] = await db.select().from(schema.media).where(eq(schema.media.id, id)).limit(1)
    if (!media) return c.json({ error: 'not_found' }, 404)
    return c.json({ media: toMediaDto(media, deps.mediaEnv) })
  })

  // Alt-text edits go via PATCH so the same endpoint can grow other small mutations later
  // (sensitive flagging, etc.) without churning the API surface.
  const altSchema = z.object({ altText: z.string().trim().max(1000).nullable() })
  route.patch('/:id/alt', requireHandle(), async (c) => {
    const session = c.get('session')!
    const { db } = c.get('ctx')
    const id = c.req.param('id')
    const body = altSchema.parse(await c.req.json())

    // Owner-only — alt text is part of the upload's authored content.
    const [media] = await db.select().from(schema.media).where(eq(schema.media.id, id)).limit(1)
    if (!media) return c.json({ error: 'not_found' }, 404)
    if (media.ownerId !== session.user.id) return c.json({ error: 'forbidden' }, 403)

    await db.update(schema.media).set({ altText: body.altText }).where(eq(schema.media.id, id))
    return c.json({ ok: true })
  })

  return route
}

export function toMediaDto(m: typeof schema.media.$inferSelect, env: MediaEnv) {
  return {
    id: m.id,
    kind: m.kind,
    mimeType: m.mimeType,
    width: m.width,
    height: m.height,
    blurhash: m.blurhash,
    altText: m.altText,
    processingState: m.processingState,
    variants: Array.isArray(m.variants)
      ? (m.variants as Array<{ kind: string; key: string; width: number; height: number }>).map((v) => ({
          ...v,
          url: publicUrl(env, v.key),
        }))
      : [],
  }
}
