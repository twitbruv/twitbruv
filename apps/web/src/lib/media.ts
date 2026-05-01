import { API_URL } from "./env"

export interface UploadedMedia {
  id: string
  kind: "image" | "video" | "gif"
  mimeType?: string | null
  processingState: "pending" | "processing" | "ready" | "failed" | "flagged"
  width: number | null
  height: number | null
  blurhash: string | null
  altText: string | null
  variants: Array<{ kind: string; url: string; width: number; height: number }>
}

/** Pick the best variant URL for a given display context. Fallbacks walk smaller to larger. */
export function pickVariantUrl(
  media: UploadedMedia,
  prefer: "thumb" | "medium" | "large" = "medium"
): string | null {
  const order =
    prefer === "thumb"
      ? ["thumb", "medium", "large"]
      : prefer === "large"
        ? ["large", "medium", "thumb"]
        : ["medium", "large", "thumb"]
  for (const kind of order) {
    const v = media.variants.find((x) => x.kind === kind)
    if (v) return v.url
  }
  return media.variants[0]?.url ?? null
}

export type MediaVariantUrlSource = Pick<UploadedMedia, "kind" | "variants"> &
  Partial<Pick<UploadedMedia, "mimeType">>

export function pickPrimaryMediaUrl(
  media: MediaVariantUrlSource,
  prefer: "thumb" | "medium" | "large" = "medium"
): string | null {
  const original = media.variants.find((x) => x.kind === "original")?.url
  if (original && (media.kind === "gif" || media.mimeType === "image/gif")) {
    return original
  }
  return pickVariantUrl(media as UploadedMedia, prefer)
}

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: "unknown" }))
    throw new Error(body.message ?? body.error ?? res.statusText)
  }
  return (await res.json()) as T
}

const MAX_DIMENSION = 2048
const COMPRESSED_MIME = "image/webp"
const COMPRESSED_QUALITY = 0.85
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024 // 5 MB post-compression ceiling

/**
 * Client-side downscale + recompress. Keeps the longest side ≤ 2048px and re-encodes as WebP.
 * Returns the original file unchanged for tiny images that wouldn't benefit, or when anything
 * fails (server still enforces its own ceiling). Never silently produces a smaller file if the
 * result would be larger than the input.
 */
export async function compressImage(file: File): Promise<File> {
  if (typeof window === "undefined") return file
  if (!file.type.startsWith("image/")) return file
  // GIFs lose animation if we re-encode; skip.
  if (file.type === "image/gif") return file

  try {
    const bitmap = await createImageBitmap(file)
    const max = Math.max(bitmap.width, bitmap.height)
    const scale = max > MAX_DIMENSION ? MAX_DIMENSION / max : 1
    const targetW = Math.round(bitmap.width * scale)
    const targetH = Math.round(bitmap.height * scale)
    const canvas =
      typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(targetW, targetH)
        : Object.assign(document.createElement("canvas"), {
            width: targetW,
            height: targetH,
          })
    const ctx = canvas.getContext("2d")
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, targetW, targetH)
    bitmap.close()

    const blob =
      canvas instanceof OffscreenCanvas
        ? await canvas.convertToBlob({
            type: COMPRESSED_MIME,
            quality: COMPRESSED_QUALITY,
          })
        : await new Promise<Blob | null>((resolve) =>
            canvas.toBlob(resolve, COMPRESSED_MIME, COMPRESSED_QUALITY)
          )
    if (!blob || blob.size >= file.size) return file
    return new File([blob], replaceExt(file.name, "webp"), {
      type: COMPRESSED_MIME,
    })
  } catch {
    return file
  }
}

function replaceExt(name: string, ext: string): string {
  const base = name.includes(".") ? name.slice(0, name.lastIndexOf(".")) : name
  return `${base}.${ext}`
}

/** Update alt text on an already-uploaded media. Best-effort — failures don't block the send. */
export async function setAltText(
  mediaId: string,
  altText: string | null
): Promise<void> {
  await json(`/api/media/${mediaId}/alt`, {
    method: "PATCH",
    body: JSON.stringify({
      altText: altText && altText.trim().length > 0 ? altText.trim() : null,
    }),
  })
}

export async function uploadImage(file: File): Promise<UploadedMedia> {
  const intent = await json<{
    mediaId: string
    uploadUrl: string
    uploadHeaders: Record<string, string>
  }>("/api/media/intent", {
    method: "POST",
    body: JSON.stringify({ mime: file.type, size: file.size }),
  })

  const putRes = await fetch(intent.uploadUrl, {
    method: "PUT",
    headers: intent.uploadHeaders,
    body: file,
  })
  if (!putRes.ok) throw new Error(`upload failed: ${putRes.status}`)

  await json(`/api/media/${intent.mediaId}/finalize`, { method: "POST" })

  // Poll until ready (or fail). Large banners + sharp variants can take a while on cold workers.
  const deadline = Date.now() + 60_000
  let lastState: UploadedMedia["processingState"] = "pending"
  while (Date.now() < deadline) {
    const { media } = await json<{ media: UploadedMedia }>(
      `/api/media/${intent.mediaId}`
    )
    lastState = media.processingState
    if (media.processingState === "ready") return media
    if (
      media.processingState === "failed" ||
      media.processingState === "flagged"
    ) {
      throw new Error(`media ${media.processingState}`)
    }
    await new Promise((r) => setTimeout(r, 800))
  }
  throw new Error(
    `media processing timed out (last state: ${lastState}) — is the worker running?`
  )
}
