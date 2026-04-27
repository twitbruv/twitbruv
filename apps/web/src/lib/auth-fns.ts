import { createServerFn } from "@tanstack/react-start"
import { getRequestHeaders } from "@tanstack/react-start/server"
import { getSessionCookie } from "better-auth/cookies"
import { COOKIE_PREFIX } from "@workspace/auth/constants"
import type { SelfUser } from "./api"

const API_URL = process.env.VITE_PUBLIC_API_URL ?? "http://localhost:3001"

export interface ServerAuthState {
  user: SelfUser | null
}

/**
 * Lightweight cookie-presence check. Used by route `beforeLoad` gates to
 * redirect between the marketing landing and the authed feed without paying
 * for a session API round-trip. Presence does not imply validity — the API
 * still revalidates before trusting the session downstream.
 */
export const checkSessionCookie = createServerFn({ method: "GET" }).handler(
  (): { hasSessionCookie: boolean } => {
    const headers = getRequestHeaders()
    return {
      hasSessionCookie:
        getSessionCookie(headers, { cookiePrefix: COOKIE_PREFIX }) !== null,
    }
  },
)

/**
 * Validates the session against the API and fetches the user profile. Runs
 * during SSR so the sidebar paints fully on first render. Short-circuits when
 * the session cookie is absent so unauthed visitors skip both fetches.
 */
export const getServerAuthState = createServerFn({ method: "GET" }).handler(
  async (): Promise<ServerAuthState> => {
    const headers = getRequestHeaders()
    if (!getSessionCookie(headers, { cookiePrefix: COOKIE_PREFIX })) {
      return { user: null }
    }

    const cookie = headers.get("cookie")
    if (!cookie) return { user: null }

    try {
      const sessionRes = await fetch(`${API_URL}/api/auth/get-session`, {
        headers: { cookie },
      })
      if (!sessionRes.ok) return { user: null }

      const sessionData = await sessionRes.json()
      if (!sessionData?.session) return { user: null }

      const meRes = await fetch(`${API_URL}/api/me`, {
        headers: { cookie },
      })
      if (!meRes.ok) return { user: null }

      const { user } = (await meRes.json()) as { user: SelfUser }
      return { user }
    } catch {
      return { user: null }
    }
  },
)
