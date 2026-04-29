import { useEffect, useRef, useState } from "react"
import { api } from "../../lib/api"
import type { UnfurlPreview } from "../../lib/api"

const URL_RE = /https?:\/\/\S+/gi

function extractFirstUrl(text: string): string | null {
  const match = text.match(URL_RE)
  if (!match) return null
  return match[0].replace(/[),.;:!?]+$/, "")
}

export function useLinkPreview(text: string) {
  const [preview, setPreview] = useState<UnfurlPreview | null>(null)
  const [loading, setLoading] = useState(false)
  const lastFetchedUrl = useRef<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const [dismissed, setDismissed] = useState(false)

  const url = extractFirstUrl(text)

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)

    if (!url) {
      lastFetchedUrl.current = null
      setPreview(null)
      setLoading(false)
      setDismissed(false)
      return
    }

    if (url === lastFetchedUrl.current) return

    setLoading(true)

    timerRef.current = setTimeout(async () => {
      if (abortRef.current) abortRef.current.abort()
      const controller = new AbortController()
      abortRef.current = controller

      try {
        const data = await api.unfurlPreview(url)
        if (controller.signal.aborted) return
        lastFetchedUrl.current = url
        setPreview(data)
        setDismissed(false)
      } catch {
        if (controller.signal.aborted) return
        lastFetchedUrl.current = url
        setPreview(null)
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, 500)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [url])

  function dismiss() {
    setDismissed(true)
  }

  return {
    preview: dismissed ? null : preview,
    loading: dismissed ? false : loading,
    dismiss,
  }
}
