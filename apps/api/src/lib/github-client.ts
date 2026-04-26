import { graphql } from '@octokit/graphql'
import { request as octokitRequest } from '@octokit/request'

// Thin Octokit wrapper. We only need GraphQL for the profile snapshot — the contributions
// calendar has no REST endpoint, so REST adds nothing here.

export interface ContributionDay {
  date: string
  count: number
  color: string
}

export interface ContributionWeek {
  days: Array<ContributionDay>
}

export interface ContributionCalendar {
  totalContributions: number
  weeks: Array<ContributionWeek>
}

export interface PinnedRepo {
  id: string
  name: string
  nameWithOwner: string
  description: string | null
  url: string
  stars: number
  forks: number
  primaryLanguage: { name: string; color: string | null } | null
}

export interface GitHubViewerProfile {
  id: string
  login: string
  name: string | null
  avatarUrl: string
  htmlUrl: string
  followers: number
  following: number
  publicRepos: number
  contributions: ContributionCalendar
  pinned: Array<PinnedRepo>
}

export class GitHubAuthError extends Error {
  constructor(message = 'github_unauthorized') {
    super(message)
  }
}

export class GitHubRateLimitError extends Error {
  constructor(message = 'github_rate_limited') {
    super(message)
  }
}

/**
 * One round trip: who-am-I + contributions calendar (last 365 days, includes private counts
 * iff the user has the "Include private contributions on my profile" toggle on) + first 6
 * pinned repositories. Querying via `viewer` (not `user(login: ...)`) is what unlocks private
 * contribution counts when the token's owner is the same human.
 */
const PROFILE_QUERY = /* GraphQL */ `
  query ViewerProfile {
    viewer {
      id
      login
      name
      avatarUrl
      url
      followers { totalCount }
      following { totalCount }
      repositories(privacy: PUBLIC, ownerAffiliations: [OWNER], isFork: false) {
        totalCount
      }
      contributionsCollection {
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays {
              date
              contributionCount
              color
            }
          }
        }
      }
      pinnedItems(first: 6, types: REPOSITORY) {
        nodes {
          ... on Repository {
            id
            name
            nameWithOwner
            description
            url
            stargazerCount
            forkCount
            primaryLanguage {
              name
              color
            }
          }
        }
      }
    }
  }
`

interface ViewerResponse {
  viewer: {
    id: string
    login: string
    name: string | null
    avatarUrl: string
    url: string
    followers: { totalCount: number }
    following: { totalCount: number }
    repositories: { totalCount: number }
    contributionsCollection: {
      contributionCalendar: {
        totalContributions: number
        weeks: Array<{
          contributionDays: Array<{
            date: string
            contributionCount: number
            color: string
          }>
        }>
      }
    }
    pinnedItems: {
      nodes: Array<{
        id: string
        name: string
        nameWithOwner: string
        description: string | null
        url: string
        stargazerCount: number
        forkCount: number
        primaryLanguage: { name: string; color: string | null } | null
      } | null>
    }
  }
}

function clientFor(token: string) {
  return graphql.defaults({
    headers: {
      authorization: `bearer ${token}`,
      'user-agent': 'twotter-connector',
    },
  })
}

function normalizeError(err: unknown): never {
  const e = err as { status?: number; message?: string }
  if (e?.status === 401 || e?.status === 403) throw new GitHubAuthError(e.message)
  if (e?.status === 429) throw new GitHubRateLimitError(e.message)
  // Octokit GraphQL errors stringify their message reasonably; bubble up.
  throw err
}

/** Fetch the full profile snapshot rendered on the user's page. */
export async function fetchViewerProfile(token: string): Promise<GitHubViewerProfile> {
  let data: ViewerResponse
  try {
    data = await clientFor(token)<ViewerResponse>(PROFILE_QUERY)
  } catch (err) {
    return normalizeError(err)
  }
  const v = data.viewer
  return {
    id: v.id,
    login: v.login,
    name: v.name,
    avatarUrl: v.avatarUrl,
    htmlUrl: v.url,
    followers: v.followers.totalCount,
    following: v.following.totalCount,
    publicRepos: v.repositories.totalCount,
    contributions: {
      totalContributions: v.contributionsCollection.contributionCalendar.totalContributions,
      weeks: v.contributionsCollection.contributionCalendar.weeks.map((w) => ({
        days: w.contributionDays.map((d) => ({
          date: d.date,
          count: d.contributionCount,
          color: d.color,
        })),
      })),
    },
    pinned: v.pinnedItems.nodes.filter((n): n is NonNullable<typeof n> => Boolean(n)).map((n) => ({
      id: n.id,
      name: n.name,
      nameWithOwner: n.nameWithOwner,
      description: n.description,
      url: n.url,
      stars: n.stargazerCount,
      forks: n.forkCount,
      primaryLanguage: n.primaryLanguage,
    })),
  }
}

/** Best-effort revoke. GitHub returns 204 on success, 404 if already gone. */
export async function revokeGrant(opts: {
  clientId: string
  clientSecret: string
  accessToken: string
}): Promise<void> {
  const basic = Buffer.from(`${opts.clientId}:${opts.clientSecret}`).toString('base64')
  try {
    await octokitRequest('DELETE /applications/{client_id}/grant', {
      client_id: opts.clientId,
      access_token: opts.accessToken,
      headers: {
        authorization: `basic ${basic}`,
        'user-agent': 'twotter-connector',
      },
    })
  } catch {
    /* non-fatal; we still drop the row locally */
  }
}

/**
 * Exchange the auth code for an access token. Doing this with `@octokit/request` rather than
 * the OAuth helpers because we run our own state/PKCE handling and just need the POST.
 */
export async function exchangeCode(opts: {
  clientId: string
  clientSecret: string
  code: string
  redirectUri: string
  codeVerifier: string
}): Promise<{ accessToken: string; scopes: Array<string> }> {
  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      'user-agent': 'twotter-connector',
    },
    body: JSON.stringify({
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      code: opts.code,
      redirect_uri: opts.redirectUri,
      code_verifier: opts.codeVerifier,
    }),
  })
  const body = (await res.json()) as {
    access_token?: string
    scope?: string
    error?: string
    error_description?: string
  }
  if (!res.ok || !body.access_token) {
    throw new Error(body.error_description ?? body.error ?? 'github_token_exchange_failed')
  }
  return {
    accessToken: body.access_token,
    scopes: (body.scope ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  }
}
