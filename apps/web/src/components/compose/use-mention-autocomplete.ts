import { useCallback, useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { api } from "../../lib/api"
import { qk } from "../../lib/query-keys"
import type { PublicUser } from "../../lib/api"

const MIN_QUERY_CHARS = 2
const MAX_RESULTS = 6
const TOKEN_RE = /^[A-Za-z0-9_.]*$/

type ActiveMention = { start: number; query: string }

function getActiveMention(text: string, caret: number): ActiveMention | null {
  let i = caret - 1
  while (i >= 0 && text[i] !== "@" && !/\s/.test(text[i])) i--
  if (i < 0 || text[i] !== "@") return null
  if (i > 0 && !/\s/.test(text[i - 1])) return null
  const query = text.slice(i + 1, caret)
  if (!TOKEN_RE.test(query)) return null
  return { start: i, query }
}

export function useMentionAutocomplete(args: {
  text: string
  caret: number
  onApply: (start: number, end: number, handle: string) => void
}) {
  const { text, caret, onApply } = args

  const active = useMemo(() => getActiveMention(text, caret), [text, caret])
  const [dismissedQuery, setDismissedQuery] = useState<string | null>(null)
  const isDismissed = active && dismissedQuery === active.query
  const enabled =
    !!active && active.query.length >= MIN_QUERY_CHARS && !isDismissed

  const { data } = useQuery({
    queryKey: qk.search(active?.query ?? ""),
    queryFn: () => api.search(active!.query),
    enabled,
    staleTime: 30_000,
  })

  const users = useMemo<Array<PublicUser>>(
    () =>
      enabled
        ? (data?.users ?? []).filter((u) => u.handle).slice(0, MAX_RESULTS)
        : [],
    [enabled, data]
  )

  const open = enabled && users.length > 0

  const [activeIndex, setActiveIndex] = useState(0)
  useEffect(() => {
    setActiveIndex(0)
  }, [active?.query])

  const apply = useCallback(
    (user: PublicUser) => {
      if (!active || !user.handle) return
      onApply(active.start, caret, user.handle)
      setDismissedQuery(active.query)
    },
    [active, caret, onApply]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
      if (!open) return false
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setActiveIndex((i) => (i + 1) % users.length)
        return true
      }
      if (e.key === "ArrowUp") {
        e.preventDefault()
        setActiveIndex((i) => (i - 1 + users.length) % users.length)
        return true
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault()
        apply(users[activeIndex])
        return true
      }
      if (e.key === "Escape") {
        e.preventDefault()
        setDismissedQuery(active.query)
        return true
      }
      return false
    },
    [open, users, activeIndex, apply, active]
  )

  return {
    open,
    users,
    activeIndex,
    setActiveIndex,
    apply,
    handleKeyDown,
  }
}
