import { createStart, createMiddleware } from "@tanstack/react-start"
import { getSessionCookie } from "better-auth/cookies"
import { COOKIE_PREFIX } from "@workspace/auth/constants"

// Runs once per SSR request. Reads the better-auth session cookie via the
// official `getSessionCookie` helper — this is a presence check only (no DB,
// no network), suitable for an edge-style gate. Routes consume the resulting
// `hasSessionCookie` flag through `beforeLoad` server functions to redirect
// unauthed visitors away from authed pages and vice versa.
const sessionCookieMiddleware = createMiddleware({ type: "request" }).server(
  async ({ request, next }) => {
    const hasSessionCookie =
      getSessionCookie(request, { cookiePrefix: COOKIE_PREFIX }) !== null
    return next({ context: { hasSessionCookie } })
  },
)

export const startInstance = createStart(() => ({
  requestMiddleware: [sessionCookieMiddleware],
}))
