import { API_URL } from "./env"
import type { DmMessage } from "./api"

export type DmEvent =
  | { type: "message"; conversationId: string; message: DmMessage }
  | {
      type: "message_edited"
      conversationId: string
      messageId: string
      text: string
      editedAt: string
    }
  | { type: "message_deleted"; conversationId: string; messageId: string }
  | {
      type: "reaction"
      conversationId: string
      messageId: string
      userId: string
      emoji: string
      op: "add" | "remove"
    }
  | { type: "read"; conversationId: string; userId: string; messageId: string }
  | { type: "membership"; conversationId: string }
  | { type: "typing"; conversationId: string; userId: string }

type Listener = (event: DmEvent) => void

// App-wide singleton: one EventSource per browser tab, fanned out to any number of UI subscribers.
// EventSource auto-reconnects on drop, so consumers don't need to reason about retries. Individual
// components just call `subscribeToDmStream(fn)` and clean up on unmount.
let source: EventSource | null = null
let refCount = 0
const listeners = new Set<Listener>()

function dispatch(raw: string) {
  let event: DmEvent
  try {
    event = JSON.parse(raw) as DmEvent
  } catch {
    return
  }
  for (const cb of listeners) {
    try {
      cb(event)
    } catch {
      /* one bad listener shouldn't stop the rest */
    }
  }
}

function ensureSource() {
  if (source) return source
  // withCredentials sends the session cookie so the API can resolve the user.
  source = new EventSource(`${API_URL}/api/dms/stream`, {
    withCredentials: true,
  })
  source.addEventListener("dm", (e) => dispatch(e.data))
  // 'ready' / 'ping' don't need handlers; EventSource stays open on them.
  return source
}

function teardown() {
  if (!source) return
  source.close()
  source = null
}

export function subscribeToDmStream(cb: Listener) {
  if (typeof window === "undefined") return () => {}
  listeners.add(cb)
  refCount += 1
  ensureSource()
  return () => {
    listeners.delete(cb)
    refCount -= 1
    if (refCount <= 0) {
      refCount = 0
      teardown()
    }
  }
}
