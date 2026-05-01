import { z } from 'zod'
import { eq } from '@workspace/db'
import type { Database } from '@workspace/db'
import { schema } from '@workspace/db'
import type { MediaEnv } from '@workspace/media/env'
import { getObjectBytes, type S3 } from '@workspace/media/s3'
import { processImage } from '@workspace/media/sharp'

export const mediaJobSchema = z.object({ mediaId: z.string().uuid() })

export async function handleMediaJob(args: {
  db: Database
  s3: S3
  env: MediaEnv
  payload: unknown
}) {
  const job = mediaJobSchema.parse(args.payload)

  const [media] = await args.db
    .select()
    .from(schema.media)
    .where(eq(schema.media.id, job.mediaId))
    .limit(1)
  if (!media) throw new Error(`media ${job.mediaId} not found`)
  if (media.processingState === 'ready' || media.processingState === 'flagged') return

  try {
    const originalBytes = await getObjectBytes(args.s3, args.env.S3_BUCKET, media.originalKey)

    if (media.kind !== 'image' && media.kind !== 'gif') {
      throw new Error(`unsupported media kind for sharp pipeline: ${media.kind}`)
    }

    const processed = await processImage({
      s3: args.s3,
      env: args.env,
      ownerId: media.ownerId,
      mediaId: media.id,
      originalBytes,
      ...(media.kind === 'gif' ? { originalKey: media.originalKey } : {}),
    })

    await args.db
      .update(schema.media)
      .set({
        mimeType: processed.mime,
        width: processed.width,
        height: processed.height,
        bytes: processed.bytes,
        blurhash: processed.blurhash,
        contentHashSha256: Buffer.from(processed.sha256Hex, 'hex'),
        variants: processed.variants,
        processingState: 'ready',
        processingError: null,
      })
      .where(eq(schema.media.id, media.id))
  } catch (err) {
    const message = err instanceof Error ? err.message : 'processing failed'
    await args.db
      .update(schema.media)
      .set({ processingState: 'failed', processingError: message })
      .where(eq(schema.media.id, media.id))
    throw err
  }
}
