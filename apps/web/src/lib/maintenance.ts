import { useSyncExternalStore } from "react"
import { MAINTENANCE_MODE as BUILD_MAINTENANCE } from "./env"

// Subscribable runtime maintenance state. Flipped to true by the api wrapper when any
// request returns 503 with `{ error: "maintenance" }`. The root layout subscribes and
// renders a full-screen lockout — every page in the app sits behind that gate.
const listeners = new Set<() => void>()
let runtimeActive = false
let runtimeMessage: string | null = null

function notify() {
  for (const fn of listeners) fn()
}

export function setRuntimeMaintenance(active: boolean, message?: string | null) {
  const nextMessage = active ? (message ?? runtimeMessage) : null
  if (active === runtimeActive && nextMessage === runtimeMessage) return
  runtimeActive = active
  runtimeMessage = nextMessage
  notify()
}

function getSnapshot() {
  return runtimeActive
}

function getServerSnapshot() {
  return false
}

function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function useMaintenance(): { active: boolean; message: string | null } {
  const runtime = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  if (BUILD_MAINTENANCE) return { active: true, message: null }
  return { active: runtime, message: runtime ? runtimeMessage : null }
}
