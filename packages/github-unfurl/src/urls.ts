// Pure parser for GitHub URLs. No IO. Recognizes the four kinds we render typed cards for:
// repo, issue, PR, commit.

export type GithubRef =
  | { kind: 'repo'; owner: string; repo: string }
  | { kind: 'issue'; owner: string; repo: string; number: number }
  | { kind: 'pull'; owner: string; repo: string; number: number }
  | { kind: 'commit'; owner: string; repo: string; sha: string }

export type GithubRefWithUrl = GithubRef & { url: string; refKey: string }

const URL_PATTERN = /https?:\/\/\S+/g
const HOSTS = new Set(['github.com', 'www.github.com'])
const NAME_RE = /^[A-Za-z0-9._-]+$/
const NUMBER_RE = /^\d+$/
const SHA_RE = /^[a-f0-9]{7,40}$/i

function trimTrailingPunct(s: string): string {
  // Twitter-style "check this out https://github.com/foo/bar." — drop the punctuation.
  return s.replace(/[),.;:!?]+$/, '')
}

function isSafeName(s: string): boolean {
  return NAME_RE.test(s) && s !== '..' && s !== '.'
}

export function parseGithubUrl(raw: string): GithubRef | null {
  const trimmed = trimTrailingPunct(raw)
  let u: URL
  try {
    u = new URL(trimmed)
  } catch {
    return null
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
  if (!HOSTS.has(u.host.toLowerCase())) return null

  const segs = u.pathname.split('/').filter(Boolean)
  if (segs.length < 2) return null
  const [owner, repo, ...rest] = segs as [string, string, ...string[]]
  if (!isSafeName(owner) || !isSafeName(repo)) return null

  if (rest.length === 0) {
    return { kind: 'repo', owner, repo }
  }
  const [section, third] = rest
  if (!third) {
    // /owner/repo/<section> — only "repo" with a tab-ish suffix counts; bail.
    return { kind: 'repo', owner, repo }
  }
  if (section === 'issues' && NUMBER_RE.test(third)) {
    return { kind: 'issue', owner, repo, number: Number(third) }
  }
  if (section === 'pull' && NUMBER_RE.test(third)) {
    return { kind: 'pull', owner, repo, number: Number(third) }
  }
  if (section === 'commit' && SHA_RE.test(third)) {
    return { kind: 'commit', owner, repo, sha: third.toLowerCase() }
  }
  // Unknown subsection (releases, discussions, blob, …) — surface as plain repo for now.
  return { kind: 'repo', owner, repo }
}

export function refKeyFor(ref: GithubRef): string {
  switch (ref.kind) {
    case 'repo':
      return `repo:${ref.owner}/${ref.repo}`
    case 'issue':
      return `issue:${ref.owner}/${ref.repo}#${ref.number}`
    case 'pull':
      return `pull:${ref.owner}/${ref.repo}#${ref.number}`
    case 'commit':
      return `commit:${ref.owner}/${ref.repo}@${ref.sha.slice(0, 12)}`
  }
}

/**
 * Walk a post's text, find every recognized GitHub URL, dedupe by refKey, return them in
 * appearance order with both the original URL (for click-through) and the canonical refKey
 * (for cache lookup).
 */
export function extractGithubRefs(text: string): Array<GithubRefWithUrl> {
  const seen = new Set<string>()
  const out: Array<GithubRefWithUrl> = []
  for (const match of text.matchAll(URL_PATTERN)) {
    const rawUrl = match[0]
    const ref = parseGithubUrl(rawUrl)
    if (!ref) continue
    const key = refKeyFor(ref)
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ ...ref, url: trimTrailingPunct(rawUrl), refKey: key })
  }
  return out
}

/** Canonicalize the URL for the urlHash column — strip query + fragment + trailing slash. */
export function canonicalizeGithubUrl(ref: GithubRef): string {
  switch (ref.kind) {
    case 'repo':
      return `https://github.com/${ref.owner}/${ref.repo}`
    case 'issue':
      return `https://github.com/${ref.owner}/${ref.repo}/issues/${ref.number}`
    case 'pull':
      return `https://github.com/${ref.owner}/${ref.repo}/pull/${ref.number}`
    case 'commit':
      return `https://github.com/${ref.owner}/${ref.repo}/commit/${ref.sha}`
  }
}
