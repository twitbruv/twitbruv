import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react"
import { clear, getTracker } from "@databuddy/sdk"
import { ApiError, api } from "./api"
import { authClient } from "./auth"
import type { ReactNode } from "react"
import type { SelfUser } from "./api"

interface MeContextValue {
  me: SelfUser | null
  isLoading: boolean
  setMe: (next: SelfUser | null) => void
  refresh: () => Promise<void>
}

const MeContext = createContext<MeContextValue | null>(null)

// Re-check the session this often while the tab is visible. Bounds how long a
// banned/suspended/deleted user can keep an idle tab open before being kicked.
const POLL_INTERVAL_MS = 30_000

export function MeProvider({ children }: { children: ReactNode }) {
  const { data: session, isPending } = authClient.useSession()
  const [me, setMe] = useState<SelfUser | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  // Guard against re-entrant signOut calls when both the poll and a parallel
  // request both observe a 401.
  const forcingOut = useRef(false)

  const forceSignOut = useCallback(async () => {
    if (forcingOut.current) return
    forcingOut.current = true
    setMe(null)
    try {
      await authClient.signOut()
    } catch {
      // Best-effort: even if the server-side signOut fails (already-revoked session,
      // network blip), the local state is cleared and the redirect will land them on
      // the public login page where they can re-auth.
    }
    if (
      typeof window !== "undefined" &&
      window.location.pathname !== "/login"
    ) {
      window.location.assign("/login")
    }
  }, [])

  const refresh = useCallback(async () => {
    if (!session) {
      setMe(null)
      return
    }
    setIsLoading(true)
    try {
      const { user } = await api.me()
      setMe(user)
    } catch (e) {
      setMe(null)
      // 401 here means the server has already invalidated the session (ban, delete,
      // expired, etc.). Treat any other error as transient and leave the better-auth
      // session alone so we don't bounce users on a network blip.
      if (e instanceof ApiError && e.status === 401) {
        await forceSignOut()
      }
    } finally {
      setIsLoading(false)
    }
  }, [session, forceSignOut])

  useEffect(() => {
    if (isPending) return
    if (!session) {
      setMe(null)
      return
    }
    refresh()
  }, [isPending, session, refresh])

  // Sync Databuddy global properties with the current user so every auto-tracked
  // event (page views, interactions, web vitals) carries user context for segmentation.
  // On sign-out, clear() resets the anonymous + session IDs so the next user on the
  // same browser gets a fresh identity. The ref tracks whether we've ever been
  // authenticated so we don't call clear() on initial page load (me starts as null).
  const wasAuthed = useRef(false)
  useEffect(() => {
    const tracker = getTracker()
    if (!tracker) return
    if (me) {
      wasAuthed.current = true
      tracker.setGlobalProperties({ role: me.role })
    } else if (wasAuthed.current) {
      wasAuthed.current = false
      tracker.setGlobalProperties({})
      clear()
    }
  }, [me])

  // Poll while authenticated + visible so users on idle tabs are kicked promptly
  // after a moderation action. We also re-check on tab focus in case the OS
  // throttled the interval while the tab was hidden.
  useEffect(() => {
    if (isPending || !session) return
    let timer: ReturnType<typeof setInterval> | null = null

    const start = () => {
      if (timer) return
      timer = setInterval(refresh, POLL_INTERVAL_MS)
    }
    const stop = () => {
      if (!timer) return
      clearInterval(timer)
      timer = null
    }
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        refresh()
        start()
      } else {
        stop()
      }
    }

    if (document.visibilityState === "visible") start()
    document.addEventListener("visibilitychange", onVisibility)
    window.addEventListener("focus", refresh)
    return () => {
      stop()
      document.removeEventListener("visibilitychange", onVisibility)
      window.removeEventListener("focus", refresh)
    }
  }, [isPending, session, refresh])

  return (
    <MeContext.Provider value={{ me, isLoading, setMe, refresh }}>
      {children}
    </MeContext.Provider>
  )
}

export function useMe() {
  const ctx = useContext(MeContext)
  if (!ctx) throw new Error("useMe must be used inside <MeProvider>")
  return ctx
}
