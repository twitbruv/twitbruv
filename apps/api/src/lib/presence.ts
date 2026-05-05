import type { Cache } from "./cache.ts"

export const PRESENCE_TTL_SEC = 90
const PRESENCE_TTL_MS = PRESENCE_TTL_SEC * 1000
const KEY = "presence:online"

export async function markOnline(cache: Cache, userId: string): Promise<void> {
  try {
    await cache.redis.zadd(KEY, Date.now(), userId)
  } catch {}
}

export type OnlinePresenceSnapshot = {
  count: number
  ids: string[]
  redisOk: boolean
}

export async function getOnlinePresence(
  cache: Cache,
  sampleLimit: number
): Promise<OnlinePresenceSnapshot> {
  try {
    const cutoff = Date.now() - PRESENCE_TTL_MS
    await cache.redis.zremrangebyscore(KEY, 0, cutoff)
    const count = await cache.redis.zcard(KEY)
    let ids: string[] = []
    if (sampleLimit > 0 && count > 0) {
      ids = await cache.redis.zrevrange(KEY, 0, sampleLimit - 1)
    }
    return { count, ids, redisOk: true }
  } catch {
    return { count: 0, ids: [], redisOk: false }
  }
}

export async function getOnlineCount(cache: Cache): Promise<number> {
  const r = await getOnlinePresence(cache, 0)
  return r.redisOk ? r.count : 0
}

export async function getOnlineUserIds(
  cache: Cache,
  limit: number
): Promise<Array<string>> {
  const r = await getOnlinePresence(cache, limit)
  return r.redisOk ? r.ids : []
}
