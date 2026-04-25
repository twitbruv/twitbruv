/**
 * Parse a pagination cursor (ISO-8601 timestamp string) into a Date. Returns undefined for
 * missing, malformed, or absurd cursors so the caller can treat "garbage cursor" the same as
 * "no cursor" — first page — instead of `new Date('whatever')` silently producing `Invalid Date`
 * and breaking the SQL `lt()` predicate. Bounding to a sane range also blocks attempts to push
 * the planner around with extreme values.
 */
export function parseCursor(raw: string | undefined | null): Date | undefined {
  if (!raw) return undefined
  // ISO-8601 only — no Unix-epoch numbers, no relative strings. Cap length to bound work.
  if (raw.length > 40) return undefined
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:?\d{2})$/.test(raw)) {
    return undefined
  }
  const ms = Date.parse(raw)
  if (!Number.isFinite(ms)) return undefined
  // Clamp to a sane window (year 2000 .. now+1d). A future-dated cursor would just return the
  // first page anyway, but rejecting outright keeps the API contract honest.
  const now = Date.now()
  if (ms < 946684800000 || ms > now + 86_400_000) return undefined
  return new Date(ms)
}
