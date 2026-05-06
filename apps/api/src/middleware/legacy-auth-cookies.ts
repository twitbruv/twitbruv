import type { MiddlewareHandler } from "hono"
import { COOKIE_PREFIX } from "@workspace/auth/constants"
import type { Env } from "../lib/env.ts"
import type { HonoEnv } from "./session.ts"

/**
 * Names Better Auth sets under our cookiePrefix (see packages/auth/server.ts).
 * When duplicate cookies exist (host-only vs Domain=.example.com), the browser sends both;
 * Better Auth may resolve the wrong one after session_data expires (#9233-style failures).
 *
 * Emitting Max-Age=0 for obsolete scopes deletes stale jar entries; cookies scoped with
 * AUTH_COOKIE_DOMAIN are different records and are not cleared by these lines.
 */
const BASE_AUTH_COOKIE_NAMES = [
  "session_token",
  "session_data",
  "better-auth-passkey",
  "dont_remember",
] as const

function cookieHeaderName(secureRequest: boolean, suffix: string): string {
  const base = `${COOKIE_PREFIX}.${suffix}`
  return secureRequest ? `__Secure-${base}` : base
}

function clearCookieHeader(name: string, domain?: string): string {
  const attrs = [`${name}=`, "Path=/", "Max-Age=0", "HttpOnly", "SameSite=Lax"]
  if (domain) {
    attrs.push(`Domain=${domain}`)
    attrs.push("Secure")
  } else if (name.startsWith("__Secure-")) {
    attrs.push("Secure")
  }
  return attrs.join("; ")
}

function requestIsHttps(c: {
  req: { header: (n: string) => string | undefined; url: string }
}): boolean {
  const xf = c.req.header("x-forwarded-proto")?.trim()
  if (xf) {
    const tokens = xf
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean)
    if (tokens.length > 0) {
      if (tokens.some((t) => t === "https")) return true
      if (tokens.some((t) => t === "http")) return false
    }
  }
  try {
    return new URL(c.req.url).protocol === "https:"
  } catch {
    return false
  }
}

export function legacyAuthCookieCleanupMiddleware(
  env: Env
): MiddlewareHandler<HonoEnv> {
  return async (c, next) => {
    await next()
    if (!env.AUTH_LEGACY_AUTH_COOKIE_CLEANUP) return

    const secureRequest = requestIsHttps(c)
    const names = BASE_AUTH_COOKIE_NAMES.map((s) =>
      cookieHeaderName(secureRequest, s)
    )

    for (const name of names) {
      c.header("Set-Cookie", clearCookieHeader(name), { append: true })
    }

    const activeCookieDomain = env.AUTH_COOKIE_DOMAIN?.trim().toLowerCase()
    for (const domain of env.AUTH_LEGACY_COOKIE_DOMAINS) {
      if (
        activeCookieDomain &&
        domain.toLowerCase() === activeCookieDomain
      ) {
        continue
      }
      for (const name of names) {
        c.header("Set-Cookie", clearCookieHeader(name, domain), {
          append: true,
        })
      }
    }
  }
}
