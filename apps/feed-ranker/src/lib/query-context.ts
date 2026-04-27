import { FOR_YOU_ALGO_VERSION } from "@workspace/types"
import { eq, schema, sql } from "@workspace/db"
import { decodeSessionCursor } from "./cursor.ts"
import type { ForYouRankRequest } from "@workspace/types"
import type { RankerRuntime } from "./runtime.ts"

export const RANKED_SESSION_TTL_SECONDS = 10 * 60
export const RANKED_SESSION_KEY_VERSION = "v1"

export interface RankedSessionState {
  sessionId: string
  postIds: Array<string>
  offset: number
  snapshotAt: string
}

export interface QueryContext {
  request: ForYouRankRequest
  userId: string
  limit: number
  cursor: string | null
  servedPostIds: Set<string>
  seenPostIds: Set<string>
  followedAuthorIds: Set<string>
  rankedSession: RankedSessionState | null
  requestedAt: Date
}

export class RankedSessionExpiredError extends Error {
  constructor() {
    super("ranked session expired")
    this.name = "RankedSessionExpiredError"
  }
}

export function rankedSessionKey(sessionId: string): string {
  return `feed:foryou:session:${sessionId}:${RANKED_SESSION_KEY_VERSION}`
}

export async function hydrateQueryContext(
  request: ForYouRankRequest,
  runtime: RankerRuntime
): Promise<QueryContext> {
  const rankedSession = request.cursor
    ? await loadRankedSession(request, runtime)
    : null
  const [followedAuthorIds, seenPostIds] = rankedSession
    ? [new Set<string>(), new Set<string>()]
    : await Promise.all([
        loadFollowedAuthorIds(request.userId, runtime),
        loadRecentSeenPostIds(request.userId, runtime),
      ])

  return {
    request,
    userId: request.userId,
    limit: request.limit,
    cursor: request.cursor ?? null,
    servedPostIds: new Set(
      rankedSession?.postIds.slice(0, rankedSession.offset) ?? []
    ),
    seenPostIds,
    followedAuthorIds,
    rankedSession,
    requestedAt: new Date(),
  }
}

async function loadRankedSession(
  request: ForYouRankRequest,
  runtime: RankerRuntime
): Promise<RankedSessionState> {
  const payload = request.cursor ? decodeSessionCursor(request.cursor) : null
  if (!payload) throw new RankedSessionExpiredError()

  const raw = await runtime.redis.get(rankedSessionKey(payload.sessionId))
  if (!raw) throw new RankedSessionExpiredError()

  const parsed = safeParseSession(raw)
  if (
    !parsed ||
    parsed.userId !== request.userId ||
    parsed.algoVersion !== FOR_YOU_ALGO_VERSION ||
    parsed.variant !== request.variant
  ) {
    throw new RankedSessionExpiredError()
  }

  if (
    parsed.postIds.length === 0 ||
    !Number.isInteger(payload.offset) ||
    payload.offset < 0 ||
    payload.offset >= parsed.postIds.length
  ) {
    throw new RankedSessionExpiredError()
  }

  return {
    sessionId: payload.sessionId,
    postIds: parsed.postIds,
    offset: payload.offset,
    snapshotAt: parsed.snapshotAt,
  }
}

async function loadFollowedAuthorIds(
  userId: string,
  runtime: RankerRuntime
): Promise<Set<string>> {
  const rows = await runtime.db
    .select({ followeeId: schema.follows.followeeId })
    .from(schema.follows)
    .where(eq(schema.follows.followerId, userId))

  return new Set(rows.map((row) => row.followeeId))
}

async function loadRecentSeenPostIds(
  userId: string,
  runtime: RankerRuntime
): Promise<Set<string>> {
  const rows = await runtime.db.execute(sql<{ subject_id: string }>`
    SELECT subject_id
    FROM ${schema.analyticsEvents}
    WHERE actor_user_id = ${userId}
      AND kind = 'impression'
      AND subject_type = 'post'
      AND subject_id IS NOT NULL
      AND created_at > now() - interval '6 hours'
    ORDER BY created_at DESC
    LIMIT 300
  `)

  return new Set(
    (rows as unknown as Array<{ subject_id: string }>).map(
      (row) => row.subject_id
    )
  )
}

function safeParseSession(raw: string): {
  userId: string
  postIds: Array<string>
  algoVersion: string
  variant: string
  snapshotAt: string
} | null {
  try {
    const parsed = JSON.parse(raw) as Partial<{
      userId: unknown
      postIds: unknown
      algoVersion: unknown
      variant: unknown
      snapshotAt: unknown
    }>
    if (typeof parsed.userId !== "string") return null
    if (
      !Array.isArray(parsed.postIds) ||
      !parsed.postIds.every((id) => typeof id === "string")
    ) {
      return null
    }
    if (typeof parsed.algoVersion !== "string") return null
    if (typeof parsed.variant !== "string") return null
    if (typeof parsed.snapshotAt !== "string") return null
    return {
      userId: parsed.userId,
      postIds: parsed.postIds,
      algoVersion: parsed.algoVersion,
      variant: parsed.variant,
      snapshotAt: parsed.snapshotAt,
    }
  } catch {
    return null
  }
}
