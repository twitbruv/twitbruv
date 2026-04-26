import type { Database } from '@workspace/db'
import { eq, schema } from '@workspace/db'
import { unfurlClient } from './octokit.ts'
import type {
  GithubCard,
  GithubCommitCard,
  GithubIssueCard,
  GithubPullCard,
  GithubRepoCard,
} from './card.ts'
import type { GithubRef } from './urls.ts'

// TTLs control how long a row is considered fresh. We don't actively revalidate today; this
// is here to make it cheap to add later. The worker job persists `expiresAt = now + TTL`.
const TTL_BY_KIND: Record<GithubRef['kind'], number> = {
  repo: 60 * 60 * 24, // 1 day — repos drift slowly
  issue: 60 * 10, // 10 min — open issues get comments
  pull: 60 * 10, // 10 min — diff stats / state can change
  commit: 60 * 60 * 24 * 30, // 30 days — commits are immutable
}

// Failure TTLs: when GitHub returns 404 we don't want to keep slamming it. Long expiry on
// "not found" because deleted repos rarely come back; short on "rate limited" so we self-heal.
const FAILURE_TTL_BY_REASON = {
  not_found: 60 * 60 * 24, // 24h
  rate_limited: 60 * 60, // 1h
  unauthorized: 60 * 60 * 24, // 24h — bad token, will just keep failing until config fix
  unknown: 60 * 10, // 10min
}

function ttlSecForRef(ref: GithubRef): number {
  return TTL_BY_KIND[ref.kind]
}

interface FetchResult {
  card: GithubCard
  title: string
  description: string | null
  imageUrl: string | null
}

export type FetchOutcome =
  | { ok: true; result: FetchResult }
  | {
      ok: false
      reason: keyof typeof FAILURE_TTL_BY_REASON
      message: string
    }

function classifyError(err: unknown): { reason: keyof typeof FAILURE_TTL_BY_REASON; message: string } {
  const e = err as { status?: number; message?: string; response?: { headers?: Record<string, string> } }
  if (e?.status === 404) return { reason: 'not_found', message: e.message ?? 'not_found' }
  if (e?.status === 401 || e?.status === 403) {
    // 403 with rate-limit headers is rate limit; 403 without is auth/abuse.
    const remaining = e.response?.headers?.['x-ratelimit-remaining']
    if (remaining === '0') return { reason: 'rate_limited', message: 'rate_limited' }
    return { reason: 'unauthorized', message: e.message ?? 'unauthorized' }
  }
  if (e?.status === 429) return { reason: 'rate_limited', message: 'rate_limited' }
  return { reason: 'unknown', message: e?.message ?? 'unknown_error' }
}

function excerpt(body: string | null | undefined, max = 280): string | null {
  if (!body) return null
  const trimmed = body.trim()
  if (trimmed.length === 0) return null
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max - 1).trimEnd()}…`
}

export async function fetchGithubCard(ref: GithubRef): Promise<FetchOutcome> {
  const client = unfurlClient()
  if (!client) return { ok: false, reason: 'unauthorized', message: 'unfurl_token_missing' }

  try {
    if (ref.kind === 'repo') {
      const r = await client('GET /repos/{owner}/{repo}', { owner: ref.owner, repo: ref.repo })
      const d = r.data
      const card: GithubRepoCard = {
        kind: 'github_repo',
        url: d.html_url,
        owner: ref.owner,
        repo: ref.repo,
        nameWithOwner: d.full_name,
        description: d.description,
        stars: d.stargazers_count,
        forks: d.forks_count,
        watchers: d.watchers_count,
        primaryLanguage: d.language ? { name: d.language, color: null } : null,
        topics: Array.isArray(d.topics) ? d.topics : [],
        isPrivate: d.private,
        isArchived: d.archived,
        isFork: d.fork,
        pushedAt: d.pushed_at,
        ownerAvatarUrl: d.owner.avatar_url,
      }
      return {
        ok: true,
        result: {
          card,
          title: d.full_name,
          description: d.description,
          imageUrl: d.owner.avatar_url,
        },
      }
    }

    if (ref.kind === 'issue' || ref.kind === 'pull') {
      // GitHub's issues endpoint also returns PRs (with `pull_request` field). If the user
      // pasted /issues/123 but 123 is actually a PR, swap to the PR fetcher to get diff
      // stats. Mirror behavior is what GitHub itself does.
      if (ref.kind === 'issue') {
        const r = await client('GET /repos/{owner}/{repo}/issues/{issue_number}', {
          owner: ref.owner,
          repo: ref.repo,
          issue_number: ref.number,
        })
        if (r.data.pull_request) {
          return fetchGithubCard({ ...ref, kind: 'pull' })
        }
        const d = r.data
        const card: GithubIssueCard = {
          kind: 'github_issue',
          url: d.html_url,
          owner: ref.owner,
          repo: ref.repo,
          number: d.number,
          title: d.title,
          state: d.state === 'closed' ? 'closed' : 'open',
          stateReason: (d.state_reason as GithubIssueCard['stateReason']) ?? null,
          authorLogin: d.user?.login ?? null,
          authorAvatarUrl: d.user?.avatar_url ?? null,
          comments: d.comments,
          excerpt: excerpt(d.body),
          labels: (d.labels ?? []).map((l) => {
            if (typeof l === 'string') return { name: l, color: null }
            return { name: l.name ?? '', color: l.color ?? null }
          }),
          createdAt: d.created_at,
          closedAt: d.closed_at,
        }
        return {
          ok: true,
          result: {
            card,
            title: `#${d.number} ${d.title}`,
            description: d.body ?? null,
            imageUrl: d.user?.avatar_url ?? null,
          },
        }
      }
      // PR
      const r = await client('GET /repos/{owner}/{repo}/pulls/{pull_number}', {
        owner: ref.owner,
        repo: ref.repo,
        pull_number: ref.number,
      })
      const d = r.data
      const state: GithubPullCard['state'] = d.merged ? 'merged' : d.state === 'closed' ? 'closed' : 'open'
      const card: GithubPullCard = {
        kind: 'github_pull',
        url: d.html_url,
        owner: ref.owner,
        repo: ref.repo,
        number: d.number,
        title: d.title,
        state,
        draft: Boolean(d.draft),
        authorLogin: d.user?.login ?? null,
        authorAvatarUrl: d.user?.avatar_url ?? null,
        headRef: d.head.ref,
        baseRef: d.base.ref,
        additions: d.additions ?? 0,
        deletions: d.deletions ?? 0,
        changedFiles: d.changed_files ?? 0,
        comments: d.comments ?? 0,
        excerpt: excerpt(d.body),
        createdAt: d.created_at,
        mergedAt: d.merged_at,
        closedAt: d.closed_at,
      }
      return {
        ok: true,
        result: {
          card,
          title: `#${d.number} ${d.title}`,
          description: d.body ?? null,
          imageUrl: d.user?.avatar_url ?? null,
        },
      }
    }

    // commit
    const r = await client('GET /repos/{owner}/{repo}/commits/{ref}', {
      owner: ref.owner,
      repo: ref.repo,
      ref: ref.sha,
    })
    const d = r.data
    const fullMessage = d.commit.message ?? ''
    const headlineEnd = fullMessage.indexOf('\n')
    const headline = headlineEnd === -1 ? fullMessage : fullMessage.slice(0, headlineEnd)
    const body = headlineEnd === -1 ? null : excerpt(fullMessage.slice(headlineEnd + 1).replace(/^\n+/, ''))
    const card: GithubCommitCard = {
      kind: 'github_commit',
      url: d.html_url,
      owner: ref.owner,
      repo: ref.repo,
      sha: d.sha,
      shortSha: d.sha.slice(0, 7),
      messageHeadline: headline,
      messageBody: body,
      authorLogin: d.author?.login ?? null,
      authorAvatarUrl: d.author?.avatar_url ?? null,
      authorName: d.commit.author?.name ?? null,
      additions: d.stats?.additions ?? 0,
      deletions: d.stats?.deletions ?? 0,
      changedFiles: d.files?.length ?? 0,
      committedAt: d.commit.author?.date ?? d.commit.committer?.date ?? new Date().toISOString(),
    }
    return {
      ok: true,
      result: {
        card,
        title: `${ref.owner}/${ref.repo}@${card.shortSha}`,
        description: headline,
        imageUrl: d.author?.avatar_url ?? null,
      },
    }
  } catch (err) {
    return { ok: false, ...classifyError(err) }
  }
}

/** Update an existing url_unfurls row with the fetched card payload, or persist failure. */
export async function persistCardOutcome(
  db: Database,
  rowId: string,
  ref: GithubRef,
  outcome: FetchOutcome,
): Promise<void> {
  const now = new Date()
  if (outcome.ok) {
    const ttlSec = ttlSecForRef(ref)
    await db
      .update(schema.urlUnfurls)
      .set({
        state: 'ready',
        // Sync kind from the actual card payload — covers issue→PR redirect where the row
        // was opened as 'github_issue' but the fetcher resolved it to a pull request.
        kind: outcome.result.card.kind,
        card: outcome.result.card,
        title: outcome.result.title,
        description: outcome.result.description,
        imageUrl: outcome.result.imageUrl,
        siteName: 'GitHub',
        providerName: 'GitHub',
        fetchedAt: now,
        expiresAt: new Date(now.getTime() + ttlSec * 1000),
      })
      .where(eq(schema.urlUnfurls.id, rowId))
    return
  }
  await persistFailureOnly(db, rowId, outcome.reason, outcome.message)
}

/**
 * Mark a url_unfurls row as failed without needing a `GithubRef`. Used by the worker when
 * the URL can't even be reparsed (so we have no kind/owner/repo to construct a ref).
 */
export async function persistFailureOnly(
  db: Database,
  rowId: string,
  reason: keyof typeof FAILURE_TTL_BY_REASON,
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
      // Stash the failure reason in `description` so we can debug from a SQL prompt without
      // a dedicated column. Cleared on next successful fetch.
      description: `unfurl_failed:${reason}:${message}`.slice(0, 500),
    })
    .where(eq(schema.urlUnfurls.id, rowId))
}
