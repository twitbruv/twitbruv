import { Hono } from 'hono'
import { compress } from 'hono/compress'
import { cors } from 'hono/cors'
import { etag } from 'hono/etag'
import { secureHeaders } from 'hono/secure-headers'
import { sql } from '@workspace/db'
import { buildContext } from './lib/context.ts'
import { handleRateLimitError } from '@workspace/rate-limit'
import { requireSameOrigin, sessionMiddleware, type HonoEnv } from './middleware/session.ts'
import { meRoute } from './routes/me.ts'
import { usersRoute } from './routes/users.ts'
import { postsRoute } from './routes/posts.ts'
import { feedRoute } from './routes/feed.ts'
import { hashtagsRoute } from './routes/hashtags.ts'
import { searchRoute } from './routes/search.ts'
import { createMediaRoute } from './routes/media.ts'
import { signedGetUrl } from '@workspace/media/s3'
import { articlesRoute } from './routes/articles.ts'
import { notificationsRoute } from './routes/notifications.ts'
import { analyticsRoute } from './routes/analytics.ts'
import { dmsRoute } from './routes/dms.ts'
import { invitesRoute } from './routes/invites.ts'
import { reportsRoute } from './routes/reports.ts'
import { federationRoute } from './routes/federation.ts'
import { adminRoute } from './routes/admin.ts'
import { pollsRoute } from './routes/polls.ts'
import { scheduledPostsRoute } from './routes/scheduled-posts.ts'
import { listsRoute } from './routes/lists.ts'
import { githubConnectorRoute } from './routes/connectors/github.ts'
import { chessRoute } from './routes/chess.ts'

const ctx = await buildContext()
const app = new Hono<HonoEnv>()

// Structured request log via pino. JSON in production, pretty in dev. Skip the noisy media
// proxy + healthcheck — every page paint hits those and they'd swamp logs.
app.use('*', async (c, next) => {
  const start = Date.now()
  await next()
  const path = c.req.path
  if (path === '/healthz' || path === '/readyz' || path.startsWith('/api/m/')) return
  ctx.log.info(
    { method: c.req.method, path, status: c.res.status, ms: Date.now() - start },
    'req',
  )
})
app.use(
  '*',
  secureHeaders({
    // CORP/COEP block legitimate cross-origin loads (the web app pulling images and JSON from
    // this API). Cross-origin access control is enforced by the CORS middleware below; turning
    // these off avoids browser-level blocks on `<img src="https://api.../api/m/...">`.
    crossOriginResourcePolicy: false,
    crossOriginEmbedderPolicy: false,
    // 1y HSTS w/ subdomains + preload, gated by env. Once enabled the browser pins the domain
    // to HTTPS — never flip on without permanent HTTPS.
    strictTransportSecurity: ctx.env.ENABLE_HSTS
      ? 'max-age=31536000; includeSubDomains; preload'
      : false,
    // Referrer leakage: we deal in private DMs and mod tools — do not leak full URLs to
    // outbound link clicks.
    referrerPolicy: 'strict-origin-when-cross-origin',
  }),
)
// Gzip/deflate JSON responses above 1KB. Feed/thread payloads compress ~5-10x.
// `compress()` skips already-encoded streams (SSE, redirects, images) so DM streaming and
// the /api/m/* signed-URL redirect pass through untouched.
app.use('*', compress())
app.use(
  '*',
  cors({
    origin: ctx.env.AUTH_TRUSTED_ORIGINS,
    credentials: true,
    allowHeaders: ['Content-Type', 'Authorization', 'X-Db-Anon-Id', 'X-Db-Session-Id'],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    exposeHeaders: ['Set-Cookie'],
    maxAge: 86400,
  }),
)
// Hard kill switch. Runs after CORS so the 503 response carries the right CORS headers and
// the browser can read the body. Health probes bypass so orchestrators don't route the
// instance out while we're locking the app down.
app.use('*', async (c, next) => {
  if (!ctx.env.MAINTENANCE_MODE) return next()
  const path = c.req.path
  if (path === '/healthz' || path === '/readyz') return next()
  c.header('Retry-After', '300')
  return c.json(
    { error: 'maintenance', message: ctx.env.MAINTENANCE_MESSAGE },
    503,
  )
})
app.use('*', sessionMiddleware(ctx))
app.use('*', requireSameOrigin(ctx.env.AUTH_TRUSTED_ORIGINS))

// Liveness: process is up. Kept cheap so Railway can hammer it.
app.get('/healthz', (c) => c.json({ ok: true }))

// Readiness: DB is reachable. Returns 503 if the ping fails so Railway can route around a
// half-broken instance instead of serving 500s to users.
app.get('/readyz', async (c) => {
  try {
    await ctx.db.execute(sql`SELECT 1`)
    return c.json({ ok: true })
  } catch (err) {
    ctx.log.error({ err: errMsg(err) }, 'readyz_db_ping_failed')
    return c.json({ ok: false, error: 'db_unreachable' }, 503)
  }
})

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

// Mount better-auth (handles /api/auth/*). Apply rate limits on the abusable flows before
// delegating to better-auth — it doesn't enforce any.
app.on(['POST', 'GET'], '/api/auth/*', async (c) => {
  const path = c.req.path
  if (c.req.method === 'POST') {
    if (path.endsWith('/sign-up/email')) await ctx.rateLimit(c, 'auth.signup')
    else if (path.endsWith('/sign-in/email')) await ctx.rateLimit(c, 'auth.signin')
    else if (path.endsWith('/sign-in/magic-link')) await ctx.rateLimit(c, 'auth.magic-link')
    else if (path.endsWith('/verify-password')) await ctx.rateLimit(c, 'auth.signin')
    else if (path.endsWith('/change-password')) await ctx.rateLimit(c, 'auth.signin')
    else if (path.endsWith('/request-password-reset')) await ctx.rateLimit(c, 'auth.password-reset')
    else if (path.includes('/reset-password')) await ctx.rateLimit(c, 'auth.password-reset')
    else if (path.endsWith('/two-factor/verify-totp')) await ctx.rateLimit(c, 'auth.2fa-verify')
    else if (path.endsWith('/two-factor/verify-backup-code')) await ctx.rateLimit(c, 'auth.2fa-verify')
    else if (path.endsWith('/two-factor/verify-otp')) await ctx.rateLimit(c, 'auth.2fa-verify')
    else if (path.endsWith('/two-factor/send-otp')) await ctx.rateLimit(c, 'auth.email-verify-resend')
    else if (path.endsWith('/send-verification-email')) await ctx.rateLimit(c, 'auth.email-verify-resend')
    else if (path.endsWith('/change-email')) await ctx.rateLimit(c, 'auth.email-verify-resend')
  }
  if (path.includes('/callback/')) await ctx.rateLimit(c, 'auth.oauth-callback')
  return ctx.auth.handler(c.req.raw)
})

// ETag for the read-heavy endpoints. Hono's middleware computes a SHA-1 of the response
// body, compares against If-None-Match, and 304s on hit. Big win for mobile clients that
// re-fetch feeds/profiles/notifications every time they foreground. We gate it to safe
// methods so a POST that returns an identical body to a previous one can't accidentally
// 304 — POST responses must always be returned in full. `weak: true` because the body gets
// compressed downstream; weak ETags survive representation changes.
const etagInner = etag({ weak: true })
const readEtag: typeof etagInner = async (c, next) => {
  if (c.req.method !== 'GET' && c.req.method !== 'HEAD') return next()
  return etagInner(c, next)
}
for (const path of [
  '/api/feed',
  '/api/feed/*',
  '/api/users/*',
  '/api/posts',
  '/api/posts/*',
  '/api/notifications',
  '/api/notifications/*',
  '/api/hashtags',
  '/api/hashtags/*',
  '/api/articles/*',
  '/api/search',
]) {
  app.use(path, readEtag)
}

app.route('/api/me', meRoute)
app.route('/api/users', usersRoute)
app.route('/api/posts', postsRoute)
app.route('/api/feed', feedRoute)
app.route('/api/hashtags', hashtagsRoute)
app.route('/api/search', searchRoute)
app.route('/api/media', createMediaRoute({ s3: ctx.s3, mediaEnv: ctx.mediaEnv, boss: ctx.boss }))

// Signing proxy: takes a stored object key on the path, mints a short-lived signed URL, and
// 302s the browser to it. We cache the redirect for a few minutes so repeated `<img>` paints
// don't thrash signing. The signed URL itself stays valid past the cache so refreshes hit the
// same underlying object cheaply.
app.get('/api/m/*', async (c) => {
  // Recover the object key by stripping every leading occurrence of the route prefix. Belt
  // and suspenders for any path-doubling that happens upstream (proxies, custom domains).
  let key = c.req.path
  while (key.startsWith('/')) key = key.slice(1)
  while (key.startsWith('api/m/')) key = key.slice('api/m/'.length)
  key = decodeURIComponent(key)
  if (!key) return c.json({ error: 'missing_key' }, 400)
  // Reject any traversal-style key. Path normalization differs across browsers and S3 SDK
  // implementations, and the bucket layout never legitimately contains "..", "//", or backslashes.
  if (
    key.includes('..') ||
    key.includes('//') ||
    key.includes('\\') ||
    key.startsWith('/')
  ) {
    return c.json({ error: 'bad_key' }, 400)
  }

  const signed = await signedGetUrl({
    s3: ctx.s3,
    bucket: ctx.mediaEnv.S3_BUCKET,
    key,
    expiresInSeconds: ctx.env.MEDIA_SIGNED_URL_TTL_SEC,
  })
  // Signing is microseconds; keep the redirect cache short so a bad deploy doesn't poison
  // browser caches for ages, but long enough to skip re-signing during a single page paint.
  c.header('Cache-Control', 'public, max-age=30')
  return c.redirect(signed, 302)
})
app.route('/api/articles', articlesRoute)
app.route('/api/notifications', notificationsRoute)
app.route('/api/analytics', analyticsRoute)
app.route('/api/dms', dmsRoute)
app.route('/api/invites', invitesRoute)
app.route('/api/reports', reportsRoute)
// Federation surfaces are mounted at root, NOT under /api, because spec paths like
// /.well-known/webfinger and /users/:handle are absolute. This intentionally collides with
// the public profile URL on the web app; the actor route content-negotiates so browsers get
// 302'd back to the web profile.
app.route('/', federationRoute)
app.route('/api/admin', adminRoute)
app.route('/api/polls', pollsRoute)
app.route('/api/scheduled-posts', scheduledPostsRoute)
app.route('/api/lists', listsRoute)
app.route('/api/connectors/github', githubConnectorRoute)
app.route('/api/chess', chessRoute)

app.notFound((c) => c.json({ error: 'not_found' }, 404))
app.onError((err, c) => {
  const rateLimited = handleRateLimitError(err, c)
  if (rateLimited) return rateLimited
  ctx.log.error({ err: err instanceof Error ? err.stack ?? err.message : err, path: c.req.path }, 'unhandled_error')
  return c.json({ error: 'internal_error', message: err.message }, 500)
})

const port = ctx.env.PORT
ctx.log.info({ port }, 'api_listening')
export default { port, fetch: app.fetch }
