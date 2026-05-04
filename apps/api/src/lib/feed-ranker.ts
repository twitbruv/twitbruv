import { createHmac } from "node:crypto"
import {
  FOR_YOU_ALGO_VERSION,
  FOR_YOU_VARIANTS,
  type ForYouRankRequest,
  type ForYouRankResponse,
} from "@workspace/types"
import type { Logger } from "./logger.ts"

/**
 * Result of asking the ranker for a page.
 *
 * - `ok`: ranker returned ordered post IDs we should hydrate.
 * - `session_expired`: HTTP 410 from the ranker. The opaque cursor refers to a Redis ranking
 *    session that's gone (TTL elapsed, ranker restart, etc.). Page 2+ MUST surface this to the
 *    client as `restartRequired: true` instead of silently swapping to a chrono fallback —
 *    that's the whole point of having an explicit signal.
 * - `unavailable`: ranker not configured, network error, non-2xx, schema mismatch, or hit our
 *    timeout. Caller may fall back to a blended chrono feed on page 1; on page 2+ this should
 *    bubble up to the client because we no longer have a stable session anyway.
 */
export type RankerResult =
  | { kind: "ok"; data: ForYouRankResponse }
  | { kind: "session_expired" }
  | { kind: "unavailable"; reason: RankerFailureReason }

export type RankerFailureReason =
  | "not_configured"
  | "timeout"
  | "network"
  | "http_error"
  | "invalid_response"

export interface RankerClientConfig {
  url: string | undefined
  token: string | undefined
  timeoutMs: number
}

export interface CallRankerOptions {
  config: RankerClientConfig
  request: ForYouRankRequest
  log: Logger
}

export async function callForYouRanker({
  config,
  request,
  log,
}: CallRankerOptions): Promise<RankerResult> {
  if (!config.url || !config.token) {
    return { kind: "unavailable", reason: "not_configured" }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), config.timeoutMs)

  let response: Response
  try {
    response = await fetch(joinUrl(config.url, "/internal/for-you"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.token}`,
      },
      body: JSON.stringify(request),
      signal: controller.signal,
    })
  } catch (err) {
    const aborted = (err as { name?: string } | null)?.name === "AbortError"
    log.warn(
      {
        err: errMsg(err),
        ...anonymizedUserLog(request.userId, config.token),
        timeoutMs: config.timeoutMs,
      },
      aborted ? "feed_ranker_timeout" : "feed_ranker_network_error"
    )
    return { kind: "unavailable", reason: aborted ? "timeout" : "network" }
  } finally {
    clearTimeout(timer)
  }

  if (response.status === 410) {
    // Drain so the connection can be reused. We don't trust the body — the contract is the
    // status code; an attacker controlling the ranker can't trick the API into restartRequired
    // any more than they could already trick it into anything else.
    await response.body?.cancel().catch(() => undefined)
    return { kind: "session_expired" }
  }

  if (!response.ok) {
    log.warn(
      {
        status: response.status,
        ...anonymizedUserLog(request.userId, config.token),
      },
      "feed_ranker_http_error"
    )
    await response.body?.cancel().catch(() => undefined)
    return { kind: "unavailable", reason: "http_error" }
  }

  let body: unknown
  try {
    body = await response.json()
  } catch (err) {
    log.warn(
      {
        err: errMsg(err),
        ...anonymizedUserLog(request.userId, config.token),
      },
      "feed_ranker_invalid_json"
    )
    return { kind: "unavailable", reason: "invalid_response" }
  }

  const data = parseRankerResponse(body)
  if (!data) {
    log.warn(
      anonymizedUserLog(request.userId, config.token),
      "feed_ranker_invalid_response_shape"
    )
    return { kind: "unavailable", reason: "invalid_response" }
  }

  return { kind: "ok", data }
}

function parseRankerResponse(value: unknown): ForYouRankResponse | null {
  if (!value || typeof value !== "object") return null
  const v = value as Record<string, unknown>
  if (!Array.isArray(v.postIds)) return null
  if (!v.postIds.every((id) => typeof id === "string" && id.length > 0))
    return null
  if (v.nextCursor !== null && typeof v.nextCursor !== "string") return null
  if (v.algoVersion !== FOR_YOU_ALGO_VERSION) return null
  if (
    typeof v.variant !== "string" ||
    !(FOR_YOU_VARIANTS as readonly string[]).includes(v.variant)
  ) {
    return null
  }
  return {
    postIds: v.postIds as string[],
    nextCursor: v.nextCursor as string | null,
    algoVersion: v.algoVersion,
    variant: v.variant as ForYouRankResponse["variant"],
  }
}

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function anonymizedUserLog(
  userId: string | undefined,
  secret: string
): { anonymizedUserId?: string } {
  if (!userId) return {}
  return {
    anonymizedUserId: createHmac("sha256", secret).update(userId).digest("hex"),
  }
}
