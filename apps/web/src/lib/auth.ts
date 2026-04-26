import { createClient } from "@workspace/auth/client"
import { API_URL } from "./env"
import { setRuntimeMaintenance } from "./maintenance"

export const authClient = createClient(API_URL, {
  // better-auth uses its own fetch, so it bypasses our api.ts request wrapper. Mirror the
  // 503 maintenance detection here so locking down the server also flips the client gate
  // when the auth session probe (which fires before any other call on cold load) is the
  // first request to hit the wall.
  onResponse: async (res) => {
    if (res.status !== 503) return
    let body: unknown = null
    try {
      body = await res.clone().json()
    } catch {
      return
    }
    if (
      body &&
      typeof body === "object" &&
      (body as { error?: unknown }).error === "maintenance"
    ) {
      const message = (body as { message?: unknown }).message
      setRuntimeMaintenance(true, typeof message === "string" ? message : null)
    }
  },
})

export const { signIn, signUp, signOut, useSession, getSession } = authClient
