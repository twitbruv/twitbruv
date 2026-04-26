import { request } from '@octokit/request'

// Token-bound Octokit REST client. Uses the shared GITHUB_UNFURL_TOKEN — never the user's
// per-account connector token, since these unfurls render to viewers who didn't connect.
//
// Authenticated rate limit is 5000/hr per token. Our cache + per-URL dedupe should keep us
// well under that ceiling in practice.

let cached: ReturnType<typeof request.defaults> | null = null
let warned = false

export function unfurlClient() {
  const token = process.env.GITHUB_UNFURL_TOKEN
  if (!token) {
    if (!warned) {
      // One-shot startup warning so missing config is visible without spamming logs.
      console.warn('[github-unfurl] GITHUB_UNFURL_TOKEN unset — GitHub post cards disabled')
      warned = true
    }
    return null
  }
  if (!cached) {
    cached = request.defaults({
      headers: {
        authorization: `token ${token}`,
        'user-agent': 'twotter-unfurl',
        accept: 'application/vnd.github+json',
      },
    })
  }
  return cached
}
