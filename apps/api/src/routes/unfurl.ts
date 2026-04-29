import { Hono } from 'hono'
import { fetchGenericCard } from '@workspace/url-unfurl-core'
import { requireHandle, type HonoEnv } from '../middleware/session.ts'

export const unfurlRoute = new Hono<HonoEnv>()

unfurlRoute.get('/preview', requireHandle(), async (c) => {
  const { rateLimit } = c.get('ctx')
  await rateLimit(c, 'unfurl.preview')

  const url = c.req.query('url')
  if (!url || url.length === 0) return c.json({ error: 'missing_url' }, 400)

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return c.json({ error: 'invalid_url' }, 400)
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return c.json({ error: 'invalid_protocol' }, 400)
  }

  const outcome = await fetchGenericCard(url)
  if (!outcome.ok) {
    return c.json({ error: 'fetch_failed', reason: outcome.reason }, 422)
  }

  const { card } = outcome.result
  return c.json({
    url: card.url,
    title: card.title,
    description: card.description,
    imageUrl: card.imageUrl,
    siteName: card.siteName,
  })
})
