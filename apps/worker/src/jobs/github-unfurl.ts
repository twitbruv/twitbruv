import type { Database } from '@workspace/db'
import { z } from 'zod'
import {
  fetchGithubCard,
  parseGithubUrl,
  persistCardOutcome,
  type GithubRef,
} from '@workspace/github-unfurl'

const payloadSchema = z.object({
  unfurlId: z.string().uuid(),
  url: z.string().url(),
  refKey: z.string().min(1),
})

export type GithubUnfurlPayload = z.infer<typeof payloadSchema>

export async function handleGithubUnfurlJob(
  db: Database,
  raw: unknown,
): Promise<{ ok: boolean; reason?: string }> {
  const parsed = payloadSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, reason: 'invalid_payload' }
  }
  const ref: GithubRef | null = parseGithubUrl(parsed.data.url)
  if (!ref) {
    // The URL was extracted server-side as recognized; if reparse fails the row's stuck in
    // pending. Mark it failed so it doesn't loop.
    await persistCardOutcome(db, parsed.data.unfurlId, { kind: 'repo', owner: 'x', repo: 'x' }, {
      ok: false,
      reason: 'unknown',
      message: 'parse_failed',
    })
    return { ok: false, reason: 'parse_failed' }
  }
  const outcome = await fetchGithubCard(ref)
  await persistCardOutcome(db, parsed.data.unfurlId, ref, outcome)
  return { ok: outcome.ok, ...(outcome.ok ? {} : { reason: outcome.reason }) }
}
