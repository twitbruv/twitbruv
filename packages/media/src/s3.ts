import {
  S3Client,
  HeadObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketCorsCommand,
  PutBucketPolicyCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import type { MediaEnv } from './env.ts'

export function createS3(env: MediaEnv) {
  return new S3Client({
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    forcePathStyle: true, // required for MinIO
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    },
    // MinIO and some non-AWS S3 implementations return 501 for requests carrying the
    // new flexible-checksum headers that AWS SDK v3 adds by default.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  })
}

export type S3 = ReturnType<typeof createS3>

export async function presignPut(args: {
  s3: S3
  bucket: string
  key: string
  contentType: string
  contentLength: number
  expiresInSeconds?: number
}): Promise<{ url: string; headers: Record<string, string> }> {
  const command = new PutObjectCommand({
    Bucket: args.bucket,
    Key: args.key,
    ContentType: args.contentType,
    ContentLength: args.contentLength,
  })
  const url = await getSignedUrl(args.s3, command, {
    expiresIn: args.expiresInSeconds ?? 900, // 15 min
  })
  return {
    url,
    headers: { 'Content-Type': args.contentType },
  }
}

export async function headObject(s3: S3, bucket: string, key: string) {
  try {
    const res = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
    return { exists: true as const, contentLength: res.ContentLength, contentType: res.ContentType }
  } catch (err) {
    const name = (err as { name?: string }).name
    if (name === 'NotFound' || name === 'NoSuchKey') return { exists: false as const }
    throw err
  }
}

export async function getObjectBytes(s3: S3, bucket: string, key: string): Promise<Uint8Array> {
  const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
  if (!res.Body) throw new Error('empty S3 object')
  const chunks: Array<Uint8Array> = []
  // @ts-expect-error — Node stream; works at runtime
  for await (const chunk of res.Body) {
    chunks.push(chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk))
  }
  let total = 0
  for (const c of chunks) total += c.byteLength
  const out = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.byteLength
  }
  return out
}

export async function putObject(args: {
  s3: S3
  bucket: string
  key: string
  body: Uint8Array
  contentType: string
  cacheControl?: string
}) {
  await args.s3.send(
    new PutObjectCommand({
      Bucket: args.bucket,
      Key: args.key,
      Body: args.body,
      ContentType: args.contentType,
      CacheControl: args.cacheControl ?? 'public, max-age=31536000, immutable',
    }),
  )
}

export async function deleteObject(s3: S3, bucket: string, key: string) {
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
}

/** Ensures the bucket exists and, where supported, sets permissive CORS for the web origin. */
export async function ensureBucket(args: {
  s3: S3
  bucket: string
  allowedOrigins: Array<string>
}) {
  try {
    await args.s3.send(new HeadBucketCommand({ Bucket: args.bucket }))
  } catch {
    await args.s3.send(new CreateBucketCommand({ Bucket: args.bucket }))
  }
  // MinIO doesn't implement PutBucketCors (uses MINIO_API_CORS_ALLOW_ORIGIN env instead).
  // R2 / real S3 do. Call it best-effort and swallow NotImplemented.
  try {
    await args.s3.send(
      new PutBucketCorsCommand({
        Bucket: args.bucket,
        CORSConfiguration: {
          CORSRules: [
            {
              AllowedOrigins: args.allowedOrigins,
              AllowedMethods: ['PUT', 'GET', 'HEAD'],
              AllowedHeaders: ['*'],
              ExposeHeaders: ['ETag'],
              MaxAgeSeconds: 3000,
            },
          ],
        },
      }),
    )
  } catch (err) {
    const name = (err as { name?: string }).name
    if (name !== 'NotImplemented') throw err
  }

  // Public read for stored objects. In prod (R2/S3) this would be replaced with a CDN in front
  // and signed URLs where appropriate; for local dev MinIO needs an explicit policy or GETs 403.
  try {
    await args.s3.send(
      new PutBucketPolicyCommand({
        Bucket: args.bucket,
        Policy: JSON.stringify({
          Version: '2012-10-17',
          Statement: [
            {
              Sid: 'PublicReadGetObject',
              Effect: 'Allow',
              Principal: '*',
              Action: ['s3:GetObject'],
              Resource: [`arn:aws:s3:::${args.bucket}/*`],
            },
          ],
        }),
      }),
    )
  } catch (err) {
    const name = (err as { name?: string }).name
    if (name !== 'NotImplemented') throw err
  }
}

/**
 * Public URL for a stored object. When `MEDIA_PROXY_BASE` is set the URL routes through the
 * API's signing proxy (private buckets); otherwise it points directly at the public bucket.
 */
export function publicUrl(env: MediaEnv, key: string) {
  if (env.MEDIA_PROXY_BASE) {
    return `${env.MEDIA_PROXY_BASE.replace(/\/$/, '')}/${key.replace(/^\/+/, '')}`
  }
  return `${env.S3_PUBLIC_URL.replace(/\/$/, '')}/${key}`
}

/** Returns the path portion of MEDIA_PROXY_BASE without leading or trailing slashes
 *  (e.g. "api/m"). Empty string when the proxy isn't configured or its URL won't parse. */
function proxyPathPrefix(env: MediaEnv): string {
  if (!env.MEDIA_PROXY_BASE) return ''
  try {
    return new URL(env.MEDIA_PROXY_BASE).pathname.replace(/^\/+|\/+$/g, '')
  } catch {
    return ''
  }
}

/** Strip a leading proxy-path prefix (e.g. "api/m/") off a key. Tolerates any number
 *  of leading slashes and repeated prefixes — both have shown up in the wild from
 *  legacy DB rows and host changes that confused earlier versions of extractKey. */
function stripProxyPath(env: MediaEnv, key: string): string {
  const prefix = proxyPathPrefix(env)
  let out = key.replace(/^\/+/, '')
  if (!prefix) return out
  while (out.startsWith(`${prefix}/`)) {
    out = out.slice(prefix.length + 1)
  }
  return out
}

/**
 * Best-effort key extraction for legacy DB rows that stored a full S3 URL (e.g. before we
 * switched to the proxy) or an already-proxied URL. Strips the host, an optional bucket
 * prefix, and the proxy path prefix so the resulting key is always relative to the bucket
 * root.
 */
export function extractKey(env: MediaEnv, urlOrKey: string): string {
  if (!urlOrKey.includes('://')) return stripProxyPath(env, urlOrKey)
  try {
    const u = new URL(urlOrKey)
    const parts = u.pathname.replace(/^\/+/, '').split('/')
    if (parts[0] === env.S3_BUCKET) return stripProxyPath(env, parts.slice(1).join('/'))
    if (parts[0]?.startsWith('bucket-')) return stripProxyPath(env, parts.slice(1).join('/'))
    return stripProxyPath(env, parts.join('/'))
  } catch {
    return urlOrKey
  }
}

/**
 * Normalize any stored asset reference (legacy public URL, bare key, or already-proxy URL)
 * into the canonical URL the browser should hit. Use this in every DTO that exposes a stored
 * `avatarUrl` / `bannerUrl` so legacy DB rows keep working without a migration.
 */
export function assetUrl(env: MediaEnv, stored: string | null | undefined): string | null {
  if (!stored) return null
  if (env.MEDIA_PROXY_BASE && stored.startsWith(env.MEDIA_PROXY_BASE)) return stored
  if (!stored.includes('://')) return publicUrl(env, stripProxyPath(env, stored))
  return publicUrl(env, extractKey(env, stored))
}

/**
 * Short-lived signed GET URL. We use this for providers that don't support public buckets
 * (e.g. Tigris). The /api/m/* endpoint mints these and 302-redirects so callers can use a
 * stable proxy URL instead of dealing with expiry on the client.
 */
export async function signedGetUrl(args: {
  s3: S3
  bucket: string
  key: string
  expiresInSeconds?: number
}): Promise<string> {
  const command = new GetObjectCommand({ Bucket: args.bucket, Key: args.key })
  return getSignedUrl(args.s3, command, { expiresIn: args.expiresInSeconds ?? 3600 })
}
