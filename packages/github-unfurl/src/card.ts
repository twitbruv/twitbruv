// Typed payload for the `card` jsonb on `url_unfurls`. One discriminated union; the kind tag
// matches the URL parser. Keep this file framework-free so it can be re-exported to the web
// without dragging in server deps.

export interface GithubRepoCard {
  kind: 'github_repo'
  url: string
  owner: string
  repo: string
  nameWithOwner: string
  description: string | null
  stars: number
  forks: number
  watchers: number
  primaryLanguage: { name: string; color: string | null } | null
  topics: Array<string>
  isPrivate: boolean
  isArchived: boolean
  isFork: boolean
  pushedAt: string | null
  ownerAvatarUrl: string
}

export interface GithubIssueCard {
  kind: 'github_issue'
  url: string
  owner: string
  repo: string
  number: number
  title: string
  state: 'open' | 'closed'
  /** GitHub returns `state_reason` for closed issues: completed | not_planned | duplicate. */
  stateReason: 'completed' | 'not_planned' | 'duplicate' | 'reopened' | null
  authorLogin: string | null
  authorAvatarUrl: string | null
  comments: number
  /** First ~280 chars of the issue body, plain text (markdown not rendered). */
  excerpt: string | null
  labels: Array<{ name: string; color: string | null }>
  createdAt: string
  closedAt: string | null
}

export interface GithubPullCard {
  kind: 'github_pull'
  url: string
  owner: string
  repo: string
  number: number
  title: string
  /** Open / closed-without-merge / merged — three visual states, three colors. */
  state: 'open' | 'closed' | 'merged'
  draft: boolean
  authorLogin: string | null
  authorAvatarUrl: string | null
  headRef: string
  baseRef: string
  additions: number
  deletions: number
  changedFiles: number
  comments: number
  excerpt: string | null
  createdAt: string
  mergedAt: string | null
  closedAt: string | null
}

export interface GithubCommitCard {
  kind: 'github_commit'
  url: string
  owner: string
  repo: string
  sha: string
  shortSha: string
  /** First line of the commit message — the `subject`. */
  messageHeadline: string
  /** Everything after the first blank line, optional. */
  messageBody: string | null
  authorLogin: string | null
  authorAvatarUrl: string | null
  authorName: string | null
  additions: number
  deletions: number
  changedFiles: number
  committedAt: string
}

export type GithubCard =
  | GithubRepoCard
  | GithubIssueCard
  | GithubPullCard
  | GithubCommitCard

export function isGithubCardKind(s: string | null | undefined): boolean {
  return (
    s === 'github_repo' ||
    s === 'github_issue' ||
    s === 'github_pull' ||
    s === 'github_commit'
  )
}
