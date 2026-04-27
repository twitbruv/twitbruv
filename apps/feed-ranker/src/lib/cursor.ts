import type { ForYouSessionCursorPayload } from "@workspace/types"

export function encodeSessionCursor(
  payload: ForYouSessionCursorPayload
): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")
}

export function decodeSessionCursor(
  cursor: string
): ForYouSessionCursorPayload | null {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8")
    const parsed = JSON.parse(raw) as Partial<ForYouSessionCursorPayload>
    if (typeof parsed.sessionId !== "string") return null
    if (typeof parsed.offset !== "number" || !Number.isInteger(parsed.offset))
      return null
    if (parsed.offset < 0) return null
    return { sessionId: parsed.sessionId, offset: parsed.offset }
  } catch {
    return null
  }
}
