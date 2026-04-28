import type { Database } from '@workspace/db'
import { z } from 'zod'
import {
  fetchYouTubeCard,
  parseYouTubeUrl,
  persistYoutubeCardOutcome,
  persistFailureOnly,
} from '@workspace/youtube-unfurl'

const payloadSchema = z.object({
  unfurlId: z.string().uuid(),
  url: z.string(),
  refKey: z.string().min(1),
})

export async function handleYoutubeUnfurlJob(
  db: Database,
  raw: unknown,
  apiKey: string | undefined,
): Promise<{ ok: boolean; reason?: string }> {
  const parsed = payloadSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, reason: 'invalid_payload' }
  }
  const ref = parseYouTubeUrl(parsed.data.url)
  if (!ref) {
    await persistFailureOnly(db, parsed.data.unfurlId, 'unknown', 'parse_failed')
    return { ok: false, reason: 'parse_failed' }
  }
  const outcome = await fetchYouTubeCard(ref, apiKey)
  await persistYoutubeCardOutcome(db, parsed.data.unfurlId, outcome)
  return { ok: outcome.ok, ...(outcome.ok ? {} : { reason: outcome.reason }) }
}
