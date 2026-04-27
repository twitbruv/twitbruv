import { useEffect } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "../lib/api"
import { subscribeToDmStream } from "../lib/dm-stream"
import { qk } from "../lib/query-keys"

export function useUnreadNotifications(enabled: boolean) {
  const { data } = useQuery({
    queryKey: qk.notifications.unread(),
    queryFn: () => api.notificationsUnreadCount(),
    enabled,
    refetchInterval: enabled ? 60_000 : false,
    select: (d) => d.count,
  })
  return data ?? 0
}

export function useUnreadDms(enabled: boolean) {
  const qc = useQueryClient()
  useEffect(() => {
    if (!enabled) return
    const unsub = subscribeToDmStream(() => {
      qc.invalidateQueries({ queryKey: qk.dms.unread() })
      qc.invalidateQueries({
        predicate: (q) =>
          Array.isArray(q.queryKey) &&
          q.queryKey[0] === "dms" &&
          q.queryKey[1] === "conversations",
      })
    })
    return unsub
  }, [enabled, qc])
  const { data } = useQuery({
    queryKey: qk.dms.unread(),
    queryFn: () => api.dmUnreadCount(),
    enabled,
    refetchInterval: enabled ? 120_000 : false,
    select: (d) => d.count,
  })
  return data ?? 0
}
