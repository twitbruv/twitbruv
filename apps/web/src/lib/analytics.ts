import { API_URL } from "./env"

interface ImpressionEvent {
  kind: "impression"
  subjectType: "post" | "article" | "profile"
  subjectId: string
}

// Dedupe within a single tab-session so scrolling a post back into view doesn't re-count.
const seen = new Set<string>()
const key = (e: ImpressionEvent) => `${e.subjectType}:${e.subjectId}`

const buffer: Array<ImpressionEvent> = []
let flushTimer: number | null = null

function schedule() {
  if (typeof window === "undefined") return
  if (flushTimer !== null) return
  flushTimer = window.setTimeout(flush, 5000)
}

async function flush() {
  if (typeof window === "undefined") return
  flushTimer = null
  if (buffer.length === 0) return
  const events = buffer.splice(0, buffer.length)
  try {
    await fetch(`${API_URL}/api/analytics/ingest`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events }),
      keepalive: true,
    })
  } catch {
    // best-effort; drop on failure
  }
}

export function recordImpression(event: ImpressionEvent) {
  if (typeof window === "undefined") return
  const k = key(event)
  if (seen.has(k)) return
  seen.add(k)
  buffer.push(event)
  schedule()
}

// Flush on pagehide / visibilitychange using sendBeacon so nothing gets dropped on nav.
if (typeof window !== "undefined") {
  const beacon = () => {
    if (buffer.length === 0) return
    const events = buffer.splice(0, buffer.length)
    try {
      const blob = new Blob([JSON.stringify({ events })], {
        type: "application/json",
      })
      navigator.sendBeacon(`${API_URL}/api/analytics/ingest`, blob)
    } catch {
      /* ignore */
    }
  }
  window.addEventListener("pagehide", beacon)
  window.addEventListener("beforeunload", beacon)
}
