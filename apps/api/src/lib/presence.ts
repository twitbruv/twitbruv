import type { Cache } from './cache.ts'

// Window after a user's last heartbeat in which we still consider them online. The web client
// pings /api/me every 30s while the tab is visible, so 90s tolerates one missed poll plus the
// usual network jitter without flapping a user offline between pings.
export const PRESENCE_TTL_SEC = 90
const PRESENCE_TTL_MS = PRESENCE_TTL_SEC * 1000
const KEY = 'presence:online'

/**
 * Mark a user as online right now. Idempotent across tabs (the same userId member is just
 * updated to the latest timestamp). Best-effort — Redis errors are swallowed so a flaky cache
 * never breaks the request that triggered the heartbeat.
 */
export async function markOnline(cache: Cache, userId: string): Promise<void> {
  try {
    await cache.redis.zadd(KEY, Date.now(), userId)
  } catch {
    // best effort
  }
}

/**
 * Drop entries older than the presence window, then return how many users are currently
 * counted as online. Pruning here (rather than via a background job) keeps the data accurate
 * with no extra moving parts.
 */
export async function getOnlineCount(cache: Cache): Promise<number> {
  try {
    const cutoff = Date.now() - PRESENCE_TTL_MS
    await cache.redis.zremrangebyscore(KEY, 0, cutoff)
    return await cache.redis.zcard(KEY)
  } catch {
    return 0
  }
}

/**
 * Return the userIds currently online, newest heartbeat first, capped at `limit`. Used for
 * the admin "who's online" sample list. Pruning is done in getOnlineCount; callers that want
 * both should call getOnlineCount first.
 */
export async function getOnlineUserIds(cache: Cache, limit: number): Promise<Array<string>> {
  if (limit <= 0) return []
  try {
    return await cache.redis.zrevrange(KEY, 0, limit - 1)
  } catch {
    return []
  }
}
