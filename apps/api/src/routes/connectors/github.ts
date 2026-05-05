import { Hono, type Context } from 'hono'
import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie'
import { createHash, randomBytes } from 'node:crypto'
import { and, eq } from '@workspace/db'
import { schema } from '@workspace/db'
import type { HonoEnv } from '../../middleware/session.ts'
import { requireHandle } from '../../middleware/session.ts'
import { connectorsEnabled, decryptToken, encryptToken } from '../../lib/connector-crypto.ts'
import { exchangeCode, revokeGrant } from '../../lib/github-client.ts'
import { bustCache, getGithubSnapshot } from '../../lib/github-snapshot.ts'
import { isUserContributor } from '../../lib/github-contributors.ts'

export const githubConnectorRoute = new Hono<HonoEnv>()

const STATE_COOKIE = 'gh_connect_state'
const STATE_TTL_SEC = 10 * 60

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function callbackUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, '')}/api/connectors/github/callback`
}

function notConfigured(c: Context<HonoEnv>) {
  return c.json({ error: 'connectors_not_configured' }, 503)
}

// Kick off the OAuth dance. Top-level navigation from the settings page; we set a signed
// state cookie and 302 to GitHub.
githubConnectorRoute.get('/start', requireHandle(), async (c) => {
  const ctx = c.get('ctx')
  if (!connectorsEnabled() || !ctx.env.GITHUB_CONNECT_CLIENT_ID) return notConfigured(c)
  await ctx.rateLimit(c, 'connectors.github.start')

  const session = c.get('session')!
  const state = b64url(randomBytes(24))
  const codeVerifier = b64url(randomBytes(48))
  const codeChallenge = b64url(createHash('sha256').update(codeVerifier).digest())

  const payload = JSON.stringify({ state, codeVerifier, userId: session.user.id })
  await setSignedCookie(c, STATE_COOKIE, payload, ctx.env.BETTER_AUTH_SECRET, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: ctx.env.NODE_ENV === 'production',
    path: '/api/connectors/github',
    maxAge: STATE_TTL_SEC,
  })

  const params = new URLSearchParams({
    client_id: ctx.env.GITHUB_CONNECT_CLIENT_ID,
    redirect_uri: callbackUrl(ctx.env.BETTER_AUTH_URL),
    // read:user is sufficient: it returns private contribution counts on the contributions
    // calendar (without exposing private repo names) when the user has the "Include private
    // contributions on my profile" option enabled in GitHub settings.
    scope: 'read:user',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    allow_signup: 'false',
  })
  return c.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`)
})

githubConnectorRoute.get('/callback', async (c) => {
  const ctx = c.get('ctx')
  if (!connectorsEnabled() || !ctx.env.GITHUB_CONNECT_CLIENT_ID || !ctx.env.GITHUB_CONNECT_CLIENT_SECRET) {
    return notConfigured(c)
  }
  await ctx.rateLimit(c, 'connectors.github.callback')

  const session = c.get('session')
  const code = c.req.query('code')
  const stateParam = c.req.query('state')
  const errorParam = c.req.query('error')

  const settled = (params: Record<string, string>) => {
    const qs = new URLSearchParams(params).toString()
    return c.redirect(`${ctx.env.PUBLIC_WEB_URL.replace(/\/$/, '')}/?${qs}`)
  }

  // Always clear the state cookie before exiting any branch — it's single-use.
  const cleanup = () =>
    deleteCookie(c, STATE_COOKIE, { path: '/api/connectors/github' })

  if (errorParam) {
    cleanup()
    return settled({ settings_tab: 'connections', connect_error: errorParam })
  }
  if (!session) {
    cleanup()
    return settled({ settings_tab: 'connections', connect_error: 'unauthorized' })
  }
  if (!code || !stateParam) {
    cleanup()
    return settled({ settings_tab: 'connections', connect_error: 'missing_code' })
  }

  const cookie = await getSignedCookie(c, ctx.env.BETTER_AUTH_SECRET, STATE_COOKIE)
  cleanup()
  if (!cookie) {
    return settled({ settings_tab: 'connections', connect_error: 'state_expired' })
  }
  let parsed: { state: string; codeVerifier: string; userId: string }
  try {
    parsed = JSON.parse(cookie)
  } catch {
    return settled({ settings_tab: 'connections', connect_error: 'state_corrupt' })
  }
  if (parsed.state !== stateParam || parsed.userId !== session.user.id) {
    return settled({ settings_tab: 'connections', connect_error: 'state_mismatch' })
  }

  let exchange: { accessToken: string; scopes: Array<string> }
  try {
    exchange = await exchangeCode({
      clientId: ctx.env.GITHUB_CONNECT_CLIENT_ID,
      clientSecret: ctx.env.GITHUB_CONNECT_CLIENT_SECRET,
      code,
      redirectUri: callbackUrl(ctx.env.BETTER_AUTH_URL),
      codeVerifier: parsed.codeVerifier,
    })
  } catch (err) {
    ctx.log.warn({ err: err instanceof Error ? err.message : err }, 'github_connect_exchange_failed')
    return settled({
      settings_tab: 'connections',
      connect_error: 'exchange_failed',
    })
  }

  // Pull the GitHub identity now so we have providerAccountId + login to store on the row.
  let viewerId = ''
  let viewerLogin = ''
  try {
    const res = await fetch('https://api.github.com/user', {
      headers: {
        authorization: `bearer ${exchange.accessToken}`,
        'user-agent': 'twotter-connector',
        accept: 'application/vnd.github+json',
      },
    })
    if (!res.ok) throw new Error(`github_user_fetch_${res.status}`)
    const u = (await res.json()) as { id: number; login: string }
    viewerId = String(u.id)
    viewerLogin = u.login
  } catch (err) {
    ctx.log.warn({ err: err instanceof Error ? err.message : err }, 'github_connect_user_fetch_failed')
    return settled({
      settings_tab: 'connections',
      connect_error: 'identity_failed',
    })
  }

  const encrypted = encryptToken(exchange.accessToken)
  const now = new Date()
  await ctx.db
    .insert(schema.oauthConnections)
    .values({
      userId: session.user.id,
      provider: 'github',
      providerAccountId: viewerId,
      providerUsername: viewerLogin,
      accessTokenEncrypted: encrypted,
      scopes: exchange.scopes,
      showOnProfile: true,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [schema.oauthConnections.userId, schema.oauthConnections.provider],
      set: {
        providerAccountId: viewerId,
        providerUsername: viewerLogin,
        accessTokenEncrypted: encrypted,
        scopes: exchange.scopes,
        updatedAt: now,
      },
    })

  // Kick off an inline refresh so the redirect lands on a populated profile. Best-effort —
  // failures here are surfaced via the snapshot's stale flag, not the redirect.
  await bustCache(ctx, session.user.id)
  await getGithubSnapshot(ctx, session.user.id, { forceRefresh: true }).catch(() => {})

  await syncContributorStatus(ctx, session.user.id, viewerLogin)

  return settled({ settings_tab: 'connections', connected: 'github' })
})

async function syncContributorStatus(
  ctx: import('../../lib/context.ts').AppContext,
  userId: string,
  login: string | null | undefined,
): Promise<void> {
  try {
    const isContributor = await isUserContributor(ctx, login)
    await ctx.db
      .update(schema.users)
      .set({
        isContributor,
        contributorCheckedAt: new Date(),
      })
      .where(eq(schema.users.id, userId))
  } catch (err) {
    ctx.log.warn(
      { err: err instanceof Error ? err.message : err, userId },
      'github_contributor_sync_failed',
    )
  }
}

// What the settings page reads to render the current connection state.
githubConnectorRoute.get('/me', requireHandle(), async (c) => {
  const ctx = c.get('ctx')
  if (!connectorsEnabled() || !ctx.env.GITHUB_CONNECT_CLIENT_ID) {
    return c.json({ connected: false, configured: false })
  }
  const session = c.get('session')!
  const [row] = await ctx.db
    .select({
      providerUsername: schema.oauthConnections.providerUsername,
      scopes: schema.oauthConnections.scopes,
      showOnProfile: schema.oauthConnections.showOnProfile,
      accessTokenEncrypted: schema.oauthConnections.accessTokenEncrypted,
      metadata: schema.oauthConnections.metadata,
      updatedAt: schema.oauthConnections.updatedAt,
    })
    .from(schema.oauthConnections)
    .where(
      and(
        eq(schema.oauthConnections.userId, session.user.id),
        eq(schema.oauthConnections.provider, 'github'),
      ),
    )
    .limit(1)
  const [userRow] = await ctx.db
    .select({
      isContributor: schema.users.isContributor,
      contributorCheckedAt: schema.users.contributorCheckedAt,
    })
    .from(schema.users)
    .where(eq(schema.users.id, session.user.id))
    .limit(1)
  const contributor = {
    isContributor: userRow?.isContributor ?? false,
    contributorCheckedAt:
      userRow?.contributorCheckedAt?.toISOString() ?? null,
    repos: ctx.env.GITHUB_CONTRIBUTOR_REPOS ?? [],
  }
  if (!row)
    return c.json({ connected: false, configured: true, contributor })

  const meta = (row.metadata ?? {}) as {
    refreshedAt?: string
    failedAt?: string
    failureReason?: string
  }
  return c.json({
    connected: true,
    configured: true,
    login: row.providerUsername,
    scopes: row.scopes ?? [],
    showOnProfile: row.showOnProfile,
    needsReconnect: !row.accessTokenEncrypted,
    refreshedAt: meta.refreshedAt ?? null,
    lastFailureAt: meta.failedAt ?? null,
    lastFailureReason: meta.failureReason ?? null,
    contributor,
  })
})

// Toggle "Show on my profile".
githubConnectorRoute.patch('/me', requireHandle(), async (c) => {
  const session = c.get('session')!
  const { db } = c.get('ctx')
  const body = (await c.req.json().catch(() => ({}))) as { showOnProfile?: boolean }
  if (typeof body.showOnProfile !== 'boolean') {
    return c.json({ error: 'invalid_body' }, 400)
  }
  await db
    .update(schema.oauthConnections)
    .set({ showOnProfile: body.showOnProfile, updatedAt: new Date() })
    .where(
      and(
        eq(schema.oauthConnections.userId, session.user.id),
        eq(schema.oauthConnections.provider, 'github'),
      ),
    )
  return c.json({ ok: true })
})

githubConnectorRoute.post('/refresh', requireHandle(), async (c) => {
  const ctx = c.get('ctx')
  await ctx.rateLimit(c, 'connectors.github.refresh')
  const session = c.get('session')!
  await bustCache(ctx, session.user.id)
  const { snapshot } = await getGithubSnapshot(ctx, session.user.id, { forceRefresh: true })
  if (!snapshot) return c.json({ error: 'refresh_failed' }, 502)
  await syncContributorStatus(ctx, session.user.id, snapshot.login)
  return c.json({ ok: true, refreshedAt: snapshot.refreshedAt, stale: snapshot.stale ?? false })
})

githubConnectorRoute.delete('/', requireHandle(), async (c) => {
  const ctx = c.get('ctx')
  const session = c.get('session')!
  const [row] = await ctx.db
    .select({
      id: schema.oauthConnections.id,
      accessTokenEncrypted: schema.oauthConnections.accessTokenEncrypted,
    })
    .from(schema.oauthConnections)
    .where(
      and(
        eq(schema.oauthConnections.userId, session.user.id),
        eq(schema.oauthConnections.provider, 'github'),
      ),
    )
    .limit(1)
  if (!row) return c.json({ ok: true })

  if (
    row.accessTokenEncrypted &&
    ctx.env.GITHUB_CONNECT_CLIENT_ID &&
    ctx.env.GITHUB_CONNECT_CLIENT_SECRET
  ) {
    try {
      await revokeGrant({
        clientId: ctx.env.GITHUB_CONNECT_CLIENT_ID,
        clientSecret: ctx.env.GITHUB_CONNECT_CLIENT_SECRET,
        accessToken: decryptToken(row.accessTokenEncrypted),
      })
    } catch {
      /* best effort */
    }
  }

  await ctx.db
    .delete(schema.pinnedConnectorItems)
    .where(
      and(
        eq(schema.pinnedConnectorItems.userId, session.user.id),
        eq(schema.pinnedConnectorItems.provider, 'github'),
      ),
    )
  await ctx.db.delete(schema.oauthConnections).where(eq(schema.oauthConnections.id, row.id))
  await ctx.db
    .update(schema.users)
    .set({ isContributor: false, contributorCheckedAt: null })
    .where(eq(schema.users.id, session.user.id))
  await bustCache(ctx, session.user.id)
  return c.json({ ok: true })
})
