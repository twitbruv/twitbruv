import { createHash } from 'node:crypto'
import { inArray } from '@workspace/db'
import { schema } from '@workspace/db'
import type { Database } from '@workspace/db'
import type { GithubRef } from '@workspace/github-unfurl'
import {
  canonicalizeGithubUrl,
  fetchGithubCard,
  parseGithubUrl,
  persistCardOutcome,
  refKeyFor as refKeyForGithub,
} from '@workspace/github-unfurl'
import type { YouTubeRef } from '@workspace/youtube-unfurl'
import {
  canonicalizeYouTubeUrl,
  fetchYouTubeCard,
  parseYouTubeUrl,
  persistYoutubeCardOutcome,
  refKeyFor as refKeyForYoutube,
} from '@workspace/youtube-unfurl'
import { persistFailureOnly } from '@workspace/url-unfurl-core'
import { URL_PATTERN, trimTrailingPunct } from '@workspace/url-unfurl-core/text'
import type PgBoss from 'pg-boss'

type CombinedUnfurl =
  | { provider: 'github'; url: string; refKey: string; ref: GithubRef }
  | { provider: 'youtube'; url: string; refKey: string; ref: YouTubeRef }

function unfurlKindGithub(ref: GithubRef): string {
  switch (ref.kind) {
    case 'repo':
      return 'github_repo'
    case 'issue':
      return 'github_issue'
    case 'pull':
      return 'github_pull'
    case 'commit':
      return 'github_commit'
  }
}

function unfurlKindYoutube(ref: YouTubeRef): string {
  switch (ref.kind) {
    case 'video':
      return 'youtube_video'
    case 'playlist':
      return 'youtube_playlist'
    case 'channel':
      return 'youtube_channel'
  }
}

function extractPostUnfurls(text: string): Array<CombinedUnfurl> {
  const seen = new Set<string>()
  const out: Array<CombinedUnfurl> = []
  for (const match of text.matchAll(URL_PATTERN)) {
    const rawUrl = match[0]
    const trimmed = trimTrailingPunct(rawUrl)
    const gh = parseGithubUrl(rawUrl)
    if (gh) {
      const key = refKeyForGithub(gh)
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ provider: 'github', url: trimmed, refKey: key, ref: gh })
      continue
    }
    const yt = parseYouTubeUrl(rawUrl)
    if (yt) {
      const key = refKeyForYoutube(yt)
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ provider: 'youtube', url: trimmed, refKey: key, ref: yt })
    }
  }
  return out
}

function hashUrl(url: string): string {
  return createHash('sha256').update(url).digest('hex')
}

function canonicalUrlFor(r: CombinedUnfurl): string {
  return r.provider === 'github' ? canonicalizeGithubUrl(r.ref) : canonicalizeYouTubeUrl(r.ref)
}

function kindFor(r: CombinedUnfurl): string {
  return r.provider === 'github' ? unfurlKindGithub(r.ref) : unfurlKindYoutube(r.ref)
}

export interface UnfurlJob {
  unfurlId: string
  url: string
  refKey: string
  provider: 'github' | 'youtube'
}

interface AttachResult {
  toEnqueue: Array<UnfurlJob>
}

export async function attachPostUnfurls(opts: {
  tx: Database
  postId: string
  text: string
  resetExistingLinks?: boolean
}): Promise<AttachResult> {
  const refs = extractPostUnfurls(opts.text)
  if (opts.resetExistingLinks) {
    await opts.tx
      .delete(schema.postUrlUnfurls)
      .where(inArray(schema.postUrlUnfurls.postId, [opts.postId]))
  }
  if (refs.length === 0) return { toEnqueue: [] }

  const now = new Date()
  const placeholderExpiry = new Date(now.getTime() + 24 * 60 * 60 * 1000)

  await opts.tx
    .insert(schema.urlUnfurls)
    .values(
      refs.map((r) => ({
        url: canonicalUrlFor(r),
        urlHash: hashUrl(canonicalUrlFor(r)),
        refKey: r.refKey,
        kind: kindFor(r),
        state: 'pending' as const,
        siteName: r.provider === 'github' ? 'GitHub' : 'YouTube',
        providerName: r.provider === 'github' ? 'GitHub' : 'YouTube',
        fetchedAt: now,
        expiresAt: placeholderExpiry,
      })),
    )
    .onConflictDoNothing({ target: schema.urlUnfurls.refKey })

  const allRows = await opts.tx
    .select({
      id: schema.urlUnfurls.id,
      refKey: schema.urlUnfurls.refKey,
      state: schema.urlUnfurls.state,
      expiresAt: schema.urlUnfurls.expiresAt,
      description: schema.urlUnfurls.description,
    })
    .from(schema.urlUnfurls)
    .where(inArray(schema.urlUnfurls.refKey, refs.map((r) => r.refKey)))

  const failedRecoveryIds = allRows
    .filter((r) => {
      if (r.state !== 'failed') return false
      const expired = r.expiresAt.getTime() <= now.getTime()
      const wasTokenMissing = r.description?.includes('unfurl_token_missing') ?? false
      return expired || wasTokenMissing
    })
    .map((r) => r.id)
  if (failedRecoveryIds.length > 0) {
    await opts.tx
      .update(schema.urlUnfurls)
      .set({ state: 'pending', fetchedAt: now, expiresAt: placeholderExpiry })
      .where(inArray(schema.urlUnfurls.id, failedRecoveryIds))
    const reset = new Set(failedRecoveryIds)
    for (const r of allRows) {
      if (reset.has(r.id)) r.state = 'pending'
    }
  }

  const byRefKey = new Map(allRows.map((r) => [r.refKey!, r]))

  const pivotValues = refs
    .map((r, position) => {
      const row = byRefKey.get(r.refKey)
      if (!row) return null
      return { postId: opts.postId, unfurlId: row.id, position }
    })
    .filter((v): v is NonNullable<typeof v> => v !== null)

  if (pivotValues.length > 0) {
    await opts.tx
      .insert(schema.postUrlUnfurls)
      .values(pivotValues)
      .onConflictDoNothing()
  }

  const toEnqueue: Array<UnfurlJob> = []
  for (const r of refs) {
    const row = byRefKey.get(r.refKey)
    if (!row) continue
    if (row.state === 'pending') {
      toEnqueue.push({
        unfurlId: row.id,
        url: r.url,
        refKey: r.refKey,
        provider: r.provider,
      })
    }
  }
  return { toEnqueue }
}

export async function dispatchUnfurlJobs(boss: PgBoss, jobs: Array<UnfurlJob>): Promise<void> {
  if (jobs.length === 0) return
  await Promise.all(
    jobs.map((j) => {
      const queue = j.provider === 'youtube' ? 'youtube.unfurl' : 'github.unfurl'
      return boss.send(queue, j).catch((err) => {
        console.warn('[unfurl] enqueue failed', {
          err: (err as Error).message,
          refKey: j.refKey,
          queue,
        })
      })
    }),
  )
}

const INLINE_FETCH_TIMEOUT_MS = 3000

export async function runInlineUnfurls(
  db: Database,
  boss: PgBoss,
  jobs: Array<UnfurlJob>,
  opts?: { youtubeApiKey?: string },
): Promise<void> {
  if (jobs.length === 0) return
  await Promise.all(
    jobs.map(async (j) => {
      let timeoutId: ReturnType<typeof setTimeout> | undefined
      const timeout = new Promise<'timeout'>((resolve) => {
        timeoutId = setTimeout(() => resolve('timeout'), INLINE_FETCH_TIMEOUT_MS)
      })
      try {
        if (j.provider === 'youtube') {
          const yref = parseYouTubeUrl(j.url)
          if (!yref) {
            await persistFailureOnly(db, j.unfurlId, 'unknown', 'parse_failed').catch(() => {})
            return
          }
          const result = await Promise.race([fetchYouTubeCard(yref, opts?.youtubeApiKey), timeout])
          if (result === 'timeout') {
            await boss.send('youtube.unfurl', j).catch((err) => {
              console.warn('[youtube-unfurl] fallback enqueue failed', {
                err: (err as Error).message,
                refKey: j.refKey,
              })
            })
            return
          }
          await persistYoutubeCardOutcome(db, j.unfurlId, result)
          return
        }
        const ref = parseGithubUrl(j.url)
        if (!ref) {
          await persistFailureOnly(db, j.unfurlId, 'unknown', 'parse_failed').catch(() => {})
          return
        }
        const result = await Promise.race([fetchGithubCard(ref), timeout])
        if (result === 'timeout') {
          await boss.send('github.unfurl', j).catch((err) => {
            console.warn('[github-unfurl] fallback enqueue failed', {
              err: (err as Error).message,
              refKey: j.refKey,
            })
          })
          return
        }
        await persistCardOutcome(db, j.unfurlId, ref, result)
      } catch (err) {
        await persistFailureOnly(db, j.unfurlId, 'unknown', (err as Error).message).catch(() => {})
      } finally {
        if (timeoutId) clearTimeout(timeoutId)
      }
    }),
  )
}
