import { useEffect, useState } from "react"
import { api } from "../lib/api"
import { subscribeToDmStream } from "../lib/dm-stream"

export function useUnreadNotifications(enabled: boolean) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (!enabled) {
      setCount(0)
      return
    }
    let cancel = false
    let latest = 0
    async function tick() {
      const requestId = ++latest
      try {
        const { count: next } = await api.notificationsUnreadCount()
        if (!cancel && requestId === latest) setCount(next)
      } catch {}
    }
    tick()
    const iv = setInterval(tick, 60_000)
    return () => {
      cancel = true
      clearInterval(iv)
    }
  }, [enabled])
  return count
}

export function useUnreadDms(enabled: boolean) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (!enabled) {
      setCount(0)
      return
    }
    let cancel = false
    let latest = 0
    async function refresh() {
      const requestId = ++latest
      try {
        const { count: next } = await api.dmUnreadCount()
        if (!cancel && requestId === latest) setCount(next)
      } catch {}
    }
    refresh()
    const iv = setInterval(refresh, 120_000)
    const unsubscribe = subscribeToDmStream(() => {
      refresh()
    })
    return () => {
      cancel = true
      clearInterval(iv)
      unsubscribe()
    }
  }, [enabled])
  return count
}
