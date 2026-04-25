/**
 * Composer draft persistence (localStorage). Keys vary by context so a reply draft on post X
 * doesn't trample the home-feed draft. Tiny on purpose — no debounce, no migrations.
 */

const PREFIX = "draft.compose."

export function draftKey(scope: {
  replyToId?: string
  quoteOfId?: string
  conversationId?: string
}) {
  if (scope.replyToId) return `${PREFIX}reply.${scope.replyToId}`
  if (scope.quoteOfId) return `${PREFIX}quote.${scope.quoteOfId}`
  if (scope.conversationId) return `${PREFIX}dm.${scope.conversationId}`
  return `${PREFIX}home`
}

export function loadDraft(key: string): string {
  if (typeof window === "undefined") return ""
  try {
    return window.localStorage.getItem(key) ?? ""
  } catch {
    return ""
  }
}

export function saveDraft(key: string, value: string): void {
  if (typeof window === "undefined") return
  try {
    if (value.length === 0) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, value)
  } catch {
    /* quota / private browsing — drop silently */
  }
}

export function clearDraft(key: string): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.removeItem(key)
  } catch {
    /* noop */
  }
}
