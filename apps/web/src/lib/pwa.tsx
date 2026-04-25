import { useCallback, useEffect, useState } from "react"

// Register the service worker on first paint. This is a no-op outside of a
// browser (e.g. during SSR) and silently bails on browsers that don't
// support service workers (older Safari, etc.).
export function registerServiceWorker() {
  if (typeof window === "undefined") return
  if (!("serviceWorker" in navigator)) return
  if (window.location.protocol !== "https:" && window.location.hostname !== "localhost") {
    // Service workers only run on https or localhost; skip otherwise to avoid
    // noisy console errors in self-hosted setups using plain http.
    return
  }
  // Defer to the load event so the SW registration doesn't compete with the
  // initial app render on first load.
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch(() => {
        /* ignore: SW registration is best-effort */
      })
  })
}

// `beforeinstallprompt` is the modern install gesture on Chromium browsers.
// Safari/iOS doesn't fire it; we render an iOS hint separately.
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: Array<string>
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>
}

export function useInstallPrompt() {
  const [evt, setEvt] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") return
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setEvt(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setInstalled(true)
      setEvt(null)
    }
    window.addEventListener("beforeinstallprompt", onPrompt)
    window.addEventListener("appinstalled", onInstalled)
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setInstalled(true)
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt)
      window.removeEventListener("appinstalled", onInstalled)
    }
  }, [])

  const promptInstall = useCallback(async () => {
    if (!evt) return false
    await evt.prompt()
    const choice = await evt.userChoice
    setEvt(null)
    return choice.outcome === "accepted"
  }, [evt])

  return { canInstall: !!evt && !installed, installed, promptInstall }
}
