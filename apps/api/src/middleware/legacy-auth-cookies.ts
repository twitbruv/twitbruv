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
 *
 * Host-only expiry runs only when AUTH_COOKIE_DOMAIN is set — otherwise live sessions may be
 * host-only and clearing them would log everyone out.
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

function normalizeCookieDomainScope(value: string): string {
  return value.trim().toLowerCase().replace(/^\./, "")
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
    const firstToken = tokens[0]
    if (firstToken === "https") return true
    if (firstToken === "http") return false
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

    if (env.AUTH_COOKIE_DOMAIN?.trim()) {
      for (const name of names) {
        c.header("Set-Cookie", clearCookieHeader(name), { append: true })
      }
    }

    const activeNormalized = env.AUTH_COOKIE_DOMAIN
      ? normalizeCookieDomainScope(env.AUTH_COOKIE_DOMAIN)
      : ""
    for (const domain of env.AUTH_LEGACY_COOKIE_DOMAINS) {
      if (
        activeNormalized &&
        normalizeCookieDomainScope(domain) === activeNormalized
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
