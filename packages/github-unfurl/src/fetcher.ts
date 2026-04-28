import type { Database } from '@workspace/db'
import {
  applyUnfurlSuccess,
  classifyHttpError,
  persistFailureOnly,
  type FetchOutcome as CoreFetchOutcome,
} from '@workspace/url-unfurl-core'
import { unfurlClient } from './octokit.ts'
import type {
  GithubCard,
  GithubCommitCard,
  GithubIssueCard,
  GithubPullCard,
  GithubRepoCard,
} from './card.ts'
import type { GithubRef } from './urls.ts'

export type FetchOutcome<TCard extends GithubCard = GithubCard> = CoreFetchOutcome<TCard>

const TTL_BY_KIND: Record<GithubRef['kind'], number> = {
  repo: 60 * 60 * 24,
  issue: 60 * 10,
  pull: 60 * 10,
  commit: 60 * 60 * 24 * 30,
}

function ttlSecForRef(ref: GithubRef): number {
  return TTL_BY_KIND[ref.kind]
}

function excerpt(body: string | null | undefined, max = 280): string | null {
  if (!body) return null
  const trimmed = body.trim()
  if (trimmed.length === 0) return null
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max - 1).trimEnd()}…`
}

export async function fetchGithubCard(ref: GithubRef): Promise<FetchOutcome<GithubCard>> {
  const client = unfurlClient()

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
    return { ok: false, ...classifyHttpError(err) }
  }
}

export async function persistCardOutcome(
  db: Database,
  rowId: string,
  ref: GithubRef,
  outcome: FetchOutcome<GithubCard>,
): Promise<void> {
  if (!outcome.ok) {
    await persistFailureOnly(db, rowId, outcome.reason, outcome.message)
    return
  }
  const ttlSec = ttlSecForRef(ref)
  await applyUnfurlSuccess(db, rowId, ttlSec, outcome.result, {
    siteName: 'GitHub',
    providerName: 'GitHub',
  })
}

export { persistFailureOnly } from '@workspace/url-unfurl-core'
