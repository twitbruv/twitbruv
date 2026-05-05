import { useCallback, useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { api } from "../../lib/api"
import { qk } from "../../lib/query-keys"
import type { PublicUser } from "../../lib/api"

const MIN_QUERY_CHARS = 2
const MAX_RESULTS = 6
const QUERY_DEBOUNCE_MS = 200
// Mirrors handleSchema in packages/validators/src/users.ts and the server-side
// mention regex in apps/api/src/lib/mentions.ts. Keep in sync.
const TOKEN_RE = /^[A-Za-z0-9_]*$/

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
  // Track the START offset of a dismissed @-token (Esc / after-apply) so the
  // popover stays hidden for the rest of that token regardless of further
  // typing.
  const [dismissedStart, setDismissedStart] = useState<number | null>(null)
  // Clear the dismissal once the caret leaves the suppressed token; otherwise
  // a fresh @-token that happens to start at the same offset (e.g. after the
  // user deleted and retyped) would silently stay suppressed.
  useEffect(() => {
    if (dismissedStart == null) return
    if (!active || active.start !== dismissedStart) setDismissedStart(null)
  }, [active, dismissedStart])
  const isDismissed = active != null && dismissedStart === active.start
  const eligible =
    !!active && active.query.length >= MIN_QUERY_CHARS && !isDismissed

  // Debounce the query string fed to TanStack Query so rapid typing doesn't
  // burn the shared `reads.search` rate-limit bucket (60/min) on every
  // keystroke. The `active`/`eligible` signals stay reactive — only the
  // network fetch is deferred.
  const [debouncedQuery, setDebouncedQuery] = useState<string | null>(null)
  useEffect(() => {
    if (!eligible) {
      setDebouncedQuery(null)
      return
    }
    const id = setTimeout(
      () => setDebouncedQuery(active.query),
      QUERY_DEBOUNCE_MS
    )
    return () => clearTimeout(id)
  }, [eligible, active?.query])

  const { data } = useQuery({
    queryKey: qk.search(debouncedQuery ?? ""),
    queryFn: () => api.search(debouncedQuery!),
    enabled: eligible && debouncedQuery != null,
    staleTime: 30_000,
  })

  const users = useMemo<Array<PublicUser>>(
    () =>
      eligible
        ? (data?.users ?? []).filter((u) => u.handle).slice(0, MAX_RESULTS)
        : [],
    [eligible, data]
  )

  const open = eligible && users.length > 0

  const [activeIndex, setActiveIndex] = useState(0)
  useEffect(() => {
    setActiveIndex(0)
  }, [active?.query])

  const apply = useCallback(
    (user: PublicUser) => {
      if (!active || !user.handle) return
      onApply(active.start, caret, user.handle)
      // Suppress the popover for the just-replaced token until the caret
      // (which updates async via the parent's queueMicrotask) catches up.
      setDismissedStart(active.start)
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
        // Let Cmd/Ctrl+Enter fall through so the parent can submit the post.
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) return false
        e.preventDefault()
        // `open` already guarantees users.length > 0; fall back to first row
        // if activeIndex is somehow stale across a result-set shrink.
        apply(users[activeIndex] ?? users[0])
        return true
      }
      if (e.key === "Escape") {
        e.preventDefault()
        setDismissedStart(active.start)
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
