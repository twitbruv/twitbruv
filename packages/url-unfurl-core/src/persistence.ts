import type { Database } from '@workspace/db'
import { eq, schema } from '@workspace/db'

export const FAILURE_TTL_BY_REASON = {
  not_found: 60 * 60 * 24,
  rate_limited: 60 * 60,
  unauthorized: 60 * 60 * 24,
  unknown: 60 * 10,
} as const

export type FailureReason = keyof typeof FAILURE_TTL_BY_REASON

export type FetchOutcome<TCard> =
  | {
      ok: true
      result: {
        card: TCard
        title: string
        description: string | null
        imageUrl: string | null
      }
    }
  | {
      ok: false
      reason: FailureReason
      message: string
    }

export function classifyHttpError(err: unknown): { reason: FailureReason; message: string } {
  const e = err as { status?: number; message?: string; response?: { headers?: Record<string, string> } }
  if (e?.status === 404) return { reason: 'not_found', message: e.message ?? 'not_found' }
  if (e?.status === 401 || e?.status === 403) {
    const remaining = e.response?.headers?.['x-ratelimit-remaining']
    if (remaining === '0') return { reason: 'rate_limited', message: 'rate_limited' }
    return { reason: 'unauthorized', message: e.message ?? 'unauthorized' }
  }
  if (e?.status === 429) return { reason: 'rate_limited', message: 'rate_limited' }
  return { reason: 'unknown', message: e?.message ?? 'unknown_error' }
}

export async function applyUnfurlSuccess<TCard extends { kind: string }>(
  db: Database,
  rowId: string,
  ttlSecWhenOk: number,
  result: {
    card: TCard
    title: string
    description: string | null
    imageUrl: string | null
  },
  meta: { siteName: string; providerName: string },
): Promise<void> {
  const now = new Date()
  await db
    .update(schema.urlUnfurls)
    .set({
      state: 'ready',
      kind: result.card.kind,
      card: result.card,
      title: result.title,
      description: result.description,
      imageUrl: result.imageUrl,
      siteName: meta.siteName,
      providerName: meta.providerName,
      fetchedAt: now,
      expiresAt: new Date(now.getTime() + ttlSecWhenOk * 1000),
    })
    .where(eq(schema.urlUnfurls.id, rowId))
}

export async function persistFailureOnly(
  db: Database,
  rowId: string,
  reason: FailureReason,
  message: string,
): Promise<void> {
  const now = new Date()
  const ttlSec = FAILURE_TTL_BY_REASON[reason]
  await db
    .update(schema.urlUnfurls)
    .set({
      state: 'failed',
      fetchedAt: now,
      expiresAt: new Date(now.getTime() + ttlSec * 1000),
      description: `unfurl_failed:${reason}:${message}`.slice(0, 500),
    })
    .where(eq(schema.urlUnfurls.id, rowId))
}
