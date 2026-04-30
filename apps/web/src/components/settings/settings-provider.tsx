import { createContext, useCallback, useContext, useRef, useState } from "react"
import { useRouter } from "@tanstack/react-router"
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { authClient } from "../../lib/auth"
import { PageLoading } from "../page-surface"
import { SettingsContent } from "./settings-content"
import type { SettingsTab } from "./types"

export type OpenSettingsOpts = {
  tab?: SettingsTab
  focusProfile?: boolean
  githubOAuth?: {
    connected?: string | null
    connectError?: string | null
  }
}

type SettingsContextValue = {
  open: (opts?: OpenSettingsOpts) => void
  close: () => void
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [opts, setOpts] = useState<OpenSettingsOpts | undefined>(undefined)
  const contentKeyRef = useRef(0)

  const { data: session, isPending: sessionPending } = authClient.useSession()

  const openSettings = useCallback((next?: OpenSettingsOpts) => {
    contentKeyRef.current += 1
    setOpts(next)
    setOpen(true)
  }, [])

  const closeSettings = useCallback(() => {
    setOpen(false)
    setOpts(undefined)
  }, [])

  const handleDeleted = useCallback(() => {
    closeSettings()
    router.navigate({ to: "/" })
  }, [closeSettings, router])

  const currentSessionId = session?.session.id ?? null

  return (
    <SettingsContext.Provider
      value={{ open: openSettings, close: closeSettings }}
    >
      {children}
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) closeSettings()
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="flex h-[min(720px,calc(100dvh-2rem))] w-full max-w-[calc(100vw-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl"
        >
          <DialogTitle className="sr-only">Settings</DialogTitle>
          {sessionPending ? (
            <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-12">
              <PageLoading />
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col">
              <SettingsContent
                key={contentKeyRef.current}
                initialTab={opts?.tab}
                focusProfile={opts?.focusProfile}
                githubOAuth={opts?.githubOAuth}
                currentSessionId={currentSessionId}
                onDeleted={handleDeleted}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </SettingsContext.Provider>
  )
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext)
  if (!ctx) {
    throw new Error("useSettings must be used within a SettingsProvider")
  }
  return ctx
}
