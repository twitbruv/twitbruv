import type { MiddlewareHandler } from 'hono'
import { eq, schema } from '@workspace/db'
import type { AppContext } from '../lib/context.ts'

export type Role = 'user' | 'admin' | 'owner'

export type HonoEnv = {
  Variables: {
    ctx: AppContext
    session: {
      user: { id: string; email: string; role: Role; banned: boolean }
      session: { id: string }
    } | null
  }
}

export function sessionMiddleware(ctx: AppContext): MiddlewareHandler<HonoEnv> {
  return async (c, next) => {
    // Bind Databuddy anonymous + session IDs from the client so server-side events
    // are stitched to the same visitor journey in the analytics dashboard.
    const dbIds = {
      anonymousId: c.req.header('X-Db-Anon-Id') ?? null,
      sessionId: c.req.header('X-Db-Session-Id') ?? null,
    }
    const requestCtx: AppContext = {
      ...ctx,
      track: (name, userId, properties) => ctx.track(name, userId, properties, dbIds),
    }
    c.set('ctx', requestCtx)
    try {
      const session = await ctx.auth.api.getSession({ headers: c.req.raw.headers })
      // Banned users get treated as logged out — no enumeration of routes that would otherwise
      // succeed, no follow-on writes. They can still log in, but every request short-circuits here.
      if (session && (session as { user: { banned?: boolean } }).user.banned) {
        c.set('session', null)
      } else {
        c.set('session', session as HonoEnv['Variables']['session'])
      }
    } catch {
      c.set('session', null)
    }
    await next()
  }
}

export function requireAuth(): MiddlewareHandler<HonoEnv> {
  return async (c, next) => {
    const session = c.get('session')
    if (!session) return c.json({ error: 'unauthorized' }, 401)
    await next()
  }
}

// Role check goes back to the DB because better-auth's session.user surface doesn't include
// custom fields like `role` by default. Per-request DB hit is fine — admin endpoints are low
// volume — and it means a role change takes effect on the very next request.
export function requireRole(...roles: Array<Role>): MiddlewareHandler<HonoEnv> {
  return async (c, next) => {
    const session = c.get('session')
    if (!session) return c.json({ error: 'unauthorized' }, 401)
    const { db } = c.get('ctx')
    const [row] = await db
      .select({ role: schema.users.role })
      .from(schema.users)
      .where(eq(schema.users.id, session.user.id))
      .limit(1)
    const role = (row?.role ?? 'user') as Role
    if (!roles.includes(role)) return c.json({ error: 'forbidden' }, 403)
    // Make the looked-up role visible to handlers (e.g. admin route checks owner-only logic).
    session.user.role = role
    await next()
  }
}

export const requireAdmin = () => requireRole('admin', 'owner')
export const requireOwner = () => requireRole('owner')

/**
 * Reject mutating requests whose `Origin` header isn't in the trusted list. This makes bare
 * curl/Postman writes fail by default — those clients omit the Origin header entirely. CORS
 * already gates browser cross-origin reads; this closes the server-side gap for state changes.
 *
 * GETs / HEADs / OPTIONS are skipped (idempotent + needed for CORS preflight). OAuth callbacks
 * (`/api/auth/callback/*`) are skipped because they're top-level navigations from external
 * providers and won't carry an Origin header.
 */
export function requireSameOrigin(trustedOrigins: Array<string>): MiddlewareHandler<HonoEnv> {
  const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS'])
  const trusted = new Set(trustedOrigins)
  return async (c, next) => {
    if (safeMethods.has(c.req.method)) return next()
    const path = c.req.path
    if (path.startsWith('/api/auth/callback/')) return next()
    const origin = c.req.header('Origin')
    if (!origin || !trusted.has(origin)) {
      return c.json({ error: 'invalid_origin' }, 403)
    }
    await next()
  }
}
