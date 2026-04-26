import { useSyncExternalStore } from "react"
import { MAINTENANCE_MODE as BUILD_MAINTENANCE } from "./env"

type RuntimeMaintenanceState = {
  active: boolean
  message: string | null
}

// Subscribable runtime maintenance state. Flipped to true by the api wrapper when any
// request returns 503 with `{ error: "maintenance" }`. The root layout subscribes and
// renders a full-screen lockout — every page in the app sits behind that gate.
const listeners = new Set<() => void>()
let runtimeState: RuntimeMaintenanceState = { active: false, message: null }
const serverSnapshot: RuntimeMaintenanceState = { active: false, message: null }
const buildSnapshot: RuntimeMaintenanceState = { active: true, message: null }

function notify() {
  for (const fn of listeners) fn()
}

export function setRuntimeMaintenance(active: boolean, message?: string | null) {
  const nextMessage = active ? (message ?? runtimeState.message) : null
  if (active === runtimeState.active && nextMessage === runtimeState.message) return
  runtimeState = { active, message: nextMessage }
  notify()
}

// useSyncExternalStore compares snapshots with Object.is — return the cached object
// reference (mutated only on real state changes) so React doesn't loop, but message-only
// updates still trigger a re-render.
function getSnapshot() {
  return runtimeState
}

function getServerSnapshot() {
  return serverSnapshot
}

function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function useMaintenance(): RuntimeMaintenanceState {
  const runtime = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  if (BUILD_MAINTENANCE) return buildSnapshot
  return runtime
}
