import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react"
import { api } from "./api"
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

export function MeProvider({ children }: { children: ReactNode }) {
  const { data: session, isPending } = authClient.useSession()
  const [me, setMe] = useState<SelfUser | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (!session) {
      setMe(null)
      return
    }
    setIsLoading(true)
    try {
      const { user } = await api.me()
      setMe(user)
    } catch {
      setMe(null)
    } finally {
      setIsLoading(false)
    }
  }, [session])

  useEffect(() => {
    if (isPending) return
    if (!session) {
      setMe(null)
      return
    }
    refresh()
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
