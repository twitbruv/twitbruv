import { request } from '@octokit/request'

let cachedAuth: ReturnType<typeof request.defaults> | null = null
let cachedAnon: ReturnType<typeof request.defaults> | null = null
let warnedAnonymous = false

function anonClient() {
  if (!cachedAnon) {
    cachedAnon = request.defaults({
      headers: {
        'user-agent': 'twotter-unfurl',
        accept: 'application/vnd.github+json',
      },
    })
  }
  return cachedAnon
}

export function unfurlClient() {
  const token = process.env.GITHUB_UNFURL_TOKEN
  if (!token) {
    if (!warnedAnonymous) {
      console.warn(
        '[github-unfurl] GITHUB_UNFURL_TOKEN unset — using unauthenticated GitHub API (~60 requests/hour per IP for public repos). Add GITHUB_UNFURL_TOKEN for higher limits and private-repo access.',
      )
      warnedAnonymous = true
    }
    return anonClient()
  }
  if (!cachedAuth) {
    cachedAuth = request.defaults({
      headers: {
        authorization: `token ${token}`,
        'user-agent': 'twotter-unfurl',
        accept: 'application/vnd.github+json',
      },
    })
  }
  return cachedAuth
}
