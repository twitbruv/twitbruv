import { track } from "@databuddy/sdk"

import { API_URL } from "./env"

export { track }

type EventName =
  | "post_created"
  | "post_deleted"
  | "post_edited"
  | "post_liked"
  | "post_unliked"
  | "post_reposted"
  | "post_unreposted"
  | "post_bookmarked"
  | "post_unbookmarked"
  | "post_pinned"
  | "post_unpinned"
  | "post_hidden"
  | "post_unhidden"
  | "user_followed"
  | "user_unfollowed"
  | "user_blocked"
  | "user_unblocked"
  | "user_muted"
  | "user_unmuted"
  | "handle_claimed"
  | "profile_updated"
  | "dm_sent"
  | "dm_started"
  | "dm_group_created"
  | "dm_message_edited"
  | "dm_message_deleted"
  | "dm_reaction_toggled"
  | "dm_members_added"
  | "dm_member_removed"
  | "article_created"
  | "article_updated"
  | "scheduled_post_published"
  | "list_created"
  | "list_deleted"
  | "list_members_added"
  | "list_member_removed"
  | "poll_voted"
  | "search_saved"
  | "search_saved_deleted"
  | "chess_game_created"
  | "content_reported"
  | "admin_user_banned"
  | "admin_user_unbanned"
  | "admin_user_shadowbanned"
  | "admin_user_unshadowbanned"
  | "admin_user_verified"
  | "admin_user_unverified"
  | "admin_user_role_set"
  | "admin_user_handle_set"
  | "admin_user_deleted"
  | "admin_report_resolved"

export async function trackedAction<T>(
  name: EventName,
  fn: () => Promise<T>,
  getProps?: (result: T) => Record<string, unknown>,
): Promise<T> {
  const result = await fn()
  try {
    track(name, getProps?.(result) ?? {})
  } catch {
    /* analytics never breaks UX */
  }
  return result
}

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
