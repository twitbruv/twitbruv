import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
} from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { clear, getTracker } from "@databuddy/sdk"
import { ApiError, api } from "./api"
import { authClient } from "./auth"
import { qk } from "./query-keys"
import type { ReactNode } from "react"
import type { SelfUser } from "./api"

type MeUpdater = SelfUser | null | ((prev: SelfUser | null) => SelfUser | null)

interface MeContextValue {
  me: SelfUser | null
  isLoading: boolean
  setMe: (next: MeUpdater) => void
  refresh: () => Promise<void>
}

const MeContext = createContext<MeContextValue | null>(null)

const HEARTBEAT_MS = 30_000

export function MeProvider({
  children,
  initialMe,
}: {
  children: ReactNode
  initialMe?: SelfUser | null
}) {
  const qc = useQueryClient()
  const { data: session, isPending: sessionPending } = authClient.useSession()
  const forcingOut = useRef(false)

  const forceSignOut = useCallback(async () => {
    if (forcingOut.current) return
    forcingOut.current = true
    qc.removeQueries({ queryKey: qk.me() })
    try {
      await authClient.signOut()
    } catch {}
    if (
      typeof window !== "undefined" &&
      window.location.pathname !== "/login"
    ) {
      window.location.assign("/login")
    }
  }, [qc])

  const meQuery = useQuery({
    queryKey: qk.me(),
    queryFn: async () => {
      try {
        return await api.me()
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) await forceSignOut()
        throw e
      }
    },
    enabled: Boolean(session) && !sessionPending,
    initialData:
      initialMe !== undefined && initialMe !== null
        ? { user: initialMe }
        : undefined,
    initialDataUpdatedAt:
      initialMe !== undefined && initialMe !== null ? Date.now() : undefined,
    staleTime: 0,
    refetchInterval: () =>
      typeof document !== "undefined" && document.visibilityState === "visible"
        ? HEARTBEAT_MS
        : false,
    refetchOnWindowFocus: Boolean(session),
  })

  useEffect(() => {
    if (!session || sessionPending || typeof document === "undefined") return
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void qc.invalidateQueries({ queryKey: qk.me() })
      }
    }
    document.addEventListener("visibilitychange", onVisibility)
    return () => document.removeEventListener("visibilitychange", onVisibility)
  }, [session, sessionPending, qc])

  const setMe = useCallback(
    (next: MeUpdater) => {
      const current = qc.getQueryData<{ user: SelfUser }>(qk.me())
      const resolved =
        typeof next === "function" ? next(current?.user ?? null) : next

      if (!resolved) {
        qc.removeQueries({ queryKey: qk.me() })
        return
      }
      qc.setQueryData(qk.me(), { user: resolved })
    },
    [qc]
  )

  const refresh = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: qk.me() })
    await qc.refetchQueries({ queryKey: qk.me() })
  }, [qc])

  let me: SelfUser | null
  if (sessionPending) {
    me = initialMe ?? null
  } else if (!session) {
    me = null
  } else {
    me = meQuery.data?.user ?? null
  }

  const isLoading = Boolean(session) && !sessionPending && meQuery.isPending

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
