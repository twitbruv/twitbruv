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
import type { XRef } from '@workspace/x-unfurl'
import {
  canonicalizeXUrl,
  fetchXStatusCard,
  parseXUrl,
  persistXStatusCardOutcome,
  refKeyFor as refKeyForX,
} from '@workspace/x-unfurl'
import {
  canonicalGenericUrl,
  fetchGenericCard,
  persistFailureOnly,
  persistGenericCardOutcome,
  refKeyForGeneric,
} from '@workspace/url-unfurl-core'
import { URL_PATTERN, trimTrailingPunct } from '@workspace/url-unfurl-core/text'
import type { AppJobQueues, UnfurlJobPayload } from './job-queues.ts'

type CombinedUnfurl =
  | { provider: 'github'; url: string; refKey: string; ref: GithubRef }
  | { provider: 'youtube'; url: string; refKey: string; ref: YouTubeRef }
  | { provider: 'x'; url: string; refKey: string; ref: XRef }
  | { provider: 'generic'; url: string; refKey: string; canonicalUrl: string }

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

function displayHostFromCanonical(canonical: string): string {
  try {
    return new URL(canonical).hostname.replace(/^www\./i, '')
  } catch {
    return 'Link'
  }
}

function extractFirstCardableUrl(text: string): CombinedUnfurl | null {
  for (const match of text.matchAll(URL_PATTERN)) {
    const rawUrl = match[0]
    const trimmed = trimTrailingPunct(rawUrl)
    const gh = parseGithubUrl(rawUrl)
    if (gh) {
      return { provider: 'github', url: trimmed, refKey: refKeyForGithub(gh), ref: gh }
    }
    const yt = parseYouTubeUrl(rawUrl)
    if (yt) {
      return { provider: 'youtube', url: trimmed, refKey: refKeyForYoutube(yt), ref: yt }
    }
    const xr = parseXUrl(rawUrl)
    if (xr) {
      return { provider: 'x', url: trimmed, refKey: refKeyForX(xr), ref: xr }
    }
    const canon = canonicalGenericUrl(trimmed)
    if (canon) {
      return {
        provider: 'generic',
        url: trimmed,
        refKey: refKeyForGeneric(canon),
        canonicalUrl: canon,
      }
    }
  }
  return null
}

function extractPostUnfurls(text: string): Array<CombinedUnfurl> {
  const first = extractFirstCardableUrl(text)
  return first ? [first] : []
}

function hashUrl(url: string): string {
  return createHash('sha256').update(url).digest('hex')
}

function canonicalUrlFor(r: CombinedUnfurl): string {
  if (r.provider === 'github') return canonicalizeGithubUrl(r.ref)
  if (r.provider === 'youtube') return canonicalizeYouTubeUrl(r.ref)
  if (r.provider === 'x') return canonicalizeXUrl(r.ref)
  return r.canonicalUrl
}

function kindFor(r: CombinedUnfurl): string {
  if (r.provider === 'github') return unfurlKindGithub(r.ref)
  if (r.provider === 'youtube') return unfurlKindYoutube(r.ref)
  if (r.provider === 'x') return 'x_status'
  return 'generic'
}

function siteLabel(r: CombinedUnfurl): string {
  if (r.provider === 'github') return 'GitHub'
  if (r.provider === 'youtube') return 'YouTube'
  if (r.provider === 'x') return 'X'
  return displayHostFromCanonical(r.canonicalUrl)
}

function providerLabel(r: CombinedUnfurl): string {
  if (r.provider === 'github') return 'GitHub'
  if (r.provider === 'youtube') return 'YouTube'
  if (r.provider === 'x') return 'X'
  return 'Web'
}

export type UnfurlJob = UnfurlJobPayload

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
        siteName: siteLabel(r),
        providerName: providerLabel(r),
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
    await opts.tx.insert(schema.postUrlUnfurls).values(pivotValues).onConflictDoNothing()
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

export async function dispatchUnfurlJobs(
  jobQueues: AppJobQueues,
  jobs: Array<UnfurlJob>,
): Promise<void> {
  if (jobs.length === 0) return
  await Promise.all(
    jobs.map((j) => {
      const queue =
        j.provider === 'youtube'
          ? 'youtube.unfurl'
          : j.provider === 'generic'
            ? 'generic.unfurl'
            : j.provider === 'x'
              ? 'x.unfurl'
              : 'github.unfurl'
      return jobQueues.enqueueUnfurl(j).catch((err) => {
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
  jobQueues: AppJobQueues,
  jobs: Array<UnfurlJob>,
  opts?: { youtubeApiKey?: string; fxtwitterApiBaseUrl?: string },
): Promise<void> {
  if (jobs.length === 0) return
  await Promise.all(
    jobs.map(async (j) => {
      let timeoutId: ReturnType<typeof setTimeout> | undefined
      const timeout = new Promise<'timeout'>((resolve) => {
        timeoutId = setTimeout(() => resolve('timeout'), INLINE_FETCH_TIMEOUT_MS)
      })
      try {
        if (j.provider === 'generic') {
          const result = await Promise.race([fetchGenericCard(j.url), timeout])
          if (result === 'timeout') {
            await jobQueues.enqueueUnfurl(j).catch((err) => {
              console.warn('[generic-unfurl] fallback enqueue failed', {
                err: (err as Error).message,
                refKey: j.refKey,
              })
            })
            return
          }
          await persistGenericCardOutcome(db, j.unfurlId, result)
          return
        }
        if (j.provider === 'youtube') {
          const yref = parseYouTubeUrl(j.url)
          if (!yref) {
            await persistFailureOnly(db, j.unfurlId, 'unknown', 'parse_failed').catch(() => {})
            return
          }
          const result = await Promise.race([fetchYouTubeCard(yref, opts?.youtubeApiKey), timeout])
          if (result === 'timeout') {
            await jobQueues.enqueueUnfurl(j).catch((err) => {
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
        if (j.provider === 'x') {
          const xref = parseXUrl(j.url)
          if (!xref) {
            await persistFailureOnly(db, j.unfurlId, 'unknown', 'parse_failed').catch(() => {})
            return
          }
          const result = await Promise.race([
            fetchXStatusCard(xref, { baseUrl: opts?.fxtwitterApiBaseUrl }),
            timeout,
          ])
          if (result === 'timeout') {
            await jobQueues.enqueueUnfurl(j).catch((err) => {
              console.warn('[x-unfurl] fallback enqueue failed', {
                err: (err as Error).message,
                refKey: j.refKey,
              })
            })
            return
          }
          await persistXStatusCardOutcome(db, j.unfurlId, result)
          return
        }
        const ref = parseGithubUrl(j.url)
        if (!ref) {
          await persistFailureOnly(db, j.unfurlId, 'unknown', 'parse_failed').catch(() => {})
          return
        }
        const result = await Promise.race([fetchGithubCard(ref), timeout])
        if (result === 'timeout') {
          await jobQueues.enqueueUnfurl(j).catch((err) => {
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
