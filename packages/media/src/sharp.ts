import sharp from 'sharp'
import { encode as encodeBlurhash } from 'blurhash'
import { createHash } from 'node:crypto'
import { fileTypeFromBuffer } from 'file-type'
import { putObject, type S3 } from './s3.ts'
import type { MediaEnv } from './env.ts'

const IMAGE_MIME_ALLOW = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif', 'image/heic', 'image/heif'])

export interface ProcessedVariant {
  kind: 'thumb' | 'medium' | 'large' | 'original'
  key: string
  width: number
  height: number
  bytes: number
}

export interface ProcessedImage {
  mime: string
  width: number
  height: number
  bytes: number
  blurhash: string
  sha256Hex: string
  variants: Array<ProcessedVariant>
}

const VARIANT_TARGETS: Array<{ kind: 'thumb' | 'medium' | 'large'; maxEdge: number }> = [
  { kind: 'thumb', maxEdge: 480 },
  { kind: 'medium', maxEdge: 1080 },
  { kind: 'large', maxEdge: 2048 },
]

export async function processImage(args: {
  s3: S3
  env: MediaEnv
  ownerId: string
  mediaId: string
  originalBytes: Uint8Array
  originalKey?: string
}): Promise<ProcessedImage> {
  const { s3, env, ownerId, mediaId, originalBytes } = args

  const sniff = await fileTypeFromBuffer(originalBytes)
  const mime = sniff?.mime ?? 'application/octet-stream'
  if (!IMAGE_MIME_ALLOW.has(mime)) {
    throw new Error(`unsupported image mime: ${mime}`)
  }

  const sha256Hex = createHash('sha256').update(originalBytes).digest('hex')

  // Normalize: rotate per EXIF, strip metadata, convert HEIC to JPEG for variants.
  const base = sharp(Buffer.from(originalBytes)).rotate().withMetadata({ exif: {} })

  const meta = await base.metadata()
  const width = meta.width ?? 0
  const height = meta.height ?? 0

  // Blurhash from a tiny RGBA sample.
  const small = await base.clone().resize(32, 32, { fit: 'inside' }).raw().ensureAlpha().toBuffer({ resolveWithObject: true })
  const blurhash = encodeBlurhash(
    new Uint8ClampedArray(small.data),
    small.info.width,
    small.info.height,
    4,
    4,
  )

  // Variants: emit WebP for broad compatibility. AVIF could be a second pass later.
  const variants: Array<ProcessedVariant> = []
  for (const target of VARIANT_TARGETS) {
    const out = await base
      .clone()
      .resize(target.maxEdge, target.maxEdge, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true })
    const key = `variants/${ownerId}/${mediaId}/${target.kind}.webp`
    await putObject({
      s3,
      bucket: env.S3_BUCKET,
      key,
      body: out.data,
      contentType: 'image/webp',
    })
    variants.push({
      kind: target.kind,
      key,
      width: out.info.width,
      height: out.info.height,
      bytes: out.info.size,
    })
  }

  if (mime === 'image/gif') {
    if (!args.originalKey) throw new Error('originalKey required for GIF processing')
    variants.push({
      kind: 'original',
      key: args.originalKey,
      width,
      height,
      bytes: originalBytes.byteLength,
    })
  }

  return {
    mime,
    width,
    height,
    bytes: originalBytes.byteLength,
    blurhash,
    sha256Hex,
    variants,
  }
}
