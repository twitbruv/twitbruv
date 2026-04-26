import { createHash } from 'node:crypto'
import { inArray } from '@workspace/db'
import { schema } from '@workspace/db'
import type { Database } from '@workspace/db'
import {
  canonicalizeGithubUrl,
  extractGithubRefs,
  type GithubRefWithUrl,
} from '@workspace/github-unfurl'
import type PgBoss from 'pg-boss'

// Maps the parser's kind tag to the column value we persist on url_unfurls.kind.
function unfurlKindFor(ref: GithubRefWithUrl): string {
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

function hashUrl(url: string): string {
  return createHash('sha256').update(url).digest('hex')
}

interface AttachResult {
  // refs newly persisted as pending — these need a worker job kicked off.
  toEnqueue: Array<{ unfurlId: string; url: string; refKey: string }>
}

/**
 * Idempotent: extract GitHub URLs from the text, ensure a `url_unfurls` row exists for each
 * (state='pending' if newly inserted), and link them to the post via `post_url_unfurls`.
 *
 * Caller is responsible for `boss.send` AFTER the surrounding transaction commits — we return
 * the enqueue payload list rather than calling boss.send here, so a tx rollback doesn't leave
 * orphaned jobs.
 *
 * Pass a `previousPostId` to clear stale links on edit; otherwise links are only added.
 */
export async function attachPostUnfurls(opts: {
  tx: Database
  postId: string
  text: string
  resetExistingLinks?: boolean
}): Promise<AttachResult> {
  const refs = extractGithubRefs(opts.text)
  if (opts.resetExistingLinks) {
    // Edit path: drop links to URLs that may no longer be in the new text. The url_unfurls
    // rows themselves stay (they're shared across posters); just the per-post pivot is reset.
    await opts.tx
      .delete(schema.postUrlUnfurls)
      .where(inArray(schema.postUrlUnfurls.postId, [opts.postId]))
  }
  if (refs.length === 0) return { toEnqueue: [] }

  const now = new Date()
  const placeholderExpiry = new Date(now.getTime() + 24 * 60 * 60 * 1000) // 24h pending TTL

  // Insert pending rows. onConflictDoNothing on refKey means callers who post a URL that
  // someone else already posted just inherit the cached row.
  await opts.tx
    .insert(schema.urlUnfurls)
    .values(
      refs.map((r) => ({
        url: canonicalizeGithubUrl(r),
        urlHash: hashUrl(canonicalizeGithubUrl(r)),
        refKey: r.refKey,
        kind: unfurlKindFor(r),
        state: 'pending' as const,
        siteName: 'GitHub',
        providerName: 'GitHub',
        fetchedAt: now,
        expiresAt: placeholderExpiry,
      })),
    )
    .onConflictDoNothing({ target: schema.urlUnfurls.refKey })

  // Now read all rows for our refKeys (the ones we just inserted + ones that already existed).
  const allRows = await opts.tx
    .select({
      id: schema.urlUnfurls.id,
      refKey: schema.urlUnfurls.refKey,
      state: schema.urlUnfurls.state,
    })
    .from(schema.urlUnfurls)
    .where(inArray(schema.urlUnfurls.refKey, refs.map((r) => r.refKey)))

  const byRefKey = new Map(allRows.map((r) => [r.refKey!, r]))

  // Pivot: link the post to each unfurl, in appearance order. onConflictDoNothing handles
  // re-insert on edit if the same URL was already linked.
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

  // Enqueue jobs only for refs that landed in 'pending' state — already-cached cards
  // (state='ready' or 'failed' with future expiry) don't need a re-fetch.
  const toEnqueue: AttachResult['toEnqueue'] = []
  for (const r of refs) {
    const row = byRefKey.get(r.refKey)
    if (!row) continue
    if (row.state === 'pending') {
      toEnqueue.push({ unfurlId: row.id, url: r.url, refKey: r.refKey })
    }
  }
  return { toEnqueue }
}

/** Fire-and-forget enqueue. Call AFTER the surrounding transaction commits. */
export async function dispatchUnfurlJobs(
  boss: PgBoss,
  jobs: Array<{ unfurlId: string; url: string; refKey: string }>,
): Promise<void> {
  if (jobs.length === 0) return
  // Send in parallel; boss.send is idempotent enough that a transient error on one doesn't
  // poison the others. Failures bubble up only as a console error.
  await Promise.all(
    jobs.map((j) =>
      boss.send('github.unfurl', j).catch((err) => {
        console.warn('[github-unfurl] enqueue failed', { err: (err as Error).message, refKey: j.refKey })
      }),
    ),
  )
}
