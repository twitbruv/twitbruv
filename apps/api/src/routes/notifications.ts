import { Hono } from 'hono'
import { and, desc, eq, inArray, isNull, lt, sql } from '@workspace/db'
import { schema } from '@workspace/db'
import { assetUrl } from '@workspace/media/s3'
import { requireAuth, type HonoEnv } from '../middleware/session.ts'
import { notificationsUnreadCacheKey } from '../lib/notify.ts'
import { parseCursor } from '../lib/cursor.ts'

export const notificationsRoute = new Hono<HonoEnv>()

notificationsRoute.use('*', requireAuth())

const UNREAD_COUNT_TTL_SEC = 30

notificationsRoute.get('/unread-count', async (c) => {
  const session = c.get('session')!
  const { db, cache, rateLimit } = c.get('ctx')
  await rateLimit(c, 'reads.notifications')
  const key = notificationsUnreadCacheKey(session.user.id)
  const hit = await cache.get<{ count: number }>(key)
  if (hit) {
    c.header('x-cache', 'hit')
    return c.json(hit)
  }
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.notifications)
    .where(
      and(eq(schema.notifications.userId, session.user.id), isNull(schema.notifications.readAt)),
    )
  const response = { count: row?.n ?? 0 }
  await cache.set(key, response, UNREAD_COUNT_TTL_SEC)
  c.header('x-cache', 'miss')
  return c.json(response)
})

notificationsRoute.get('/', async (c) => {
  const session = c.get('session')!
  const { db, mediaEnv, rateLimit } = c.get('ctx')
  await rateLimit(c, 'reads.notifications')
  const limit = Math.min(Number(c.req.query('limit') ?? 40), 100)
  const cursor = parseCursor(c.req.query('cursor'))
  const unreadOnly = c.req.query('unread') === '1'

  const rows = await db
    .select({
      n: schema.notifications,
      actor: schema.users,
    })
    .from(schema.notifications)
    .leftJoin(schema.users, eq(schema.users.id, schema.notifications.actorId))
    .where(
      and(
        eq(schema.notifications.userId, session.user.id),
        unreadOnly ? isNull(schema.notifications.readAt) : undefined,
        cursor ? lt(schema.notifications.createdAt, cursor) : undefined,
      ),
    )
    .orderBy(desc(schema.notifications.createdAt))
    .limit(limit)

  const items = rows.map((r) => ({
    id: r.n.id,
    kind: r.n.kind,
    createdAt: r.n.createdAt.toISOString(),
    readAt: r.n.readAt?.toISOString() ?? null,
    entityType: r.n.entityType,
    entityId: r.n.entityId,
    actor: r.actor
      ? {
          id: r.actor.id,
          handle: r.actor.handle,
          displayName: r.actor.displayName,
          avatarUrl: assetUrl(mediaEnv, r.actor.avatarUrl),
          isVerified: r.actor.isVerified,
        }
      : null,
  }))
  const nextCursor = rows.length === limit ? rows[rows.length - 1]!.n.createdAt.toISOString() : null
  return c.json({ notifications: items, nextCursor })
})

notificationsRoute.post('/mark-read', async (c) => {
  const session = c.get('session')!
  const { db, cache } = c.get('ctx')
  const body = (await c.req.json().catch(() => ({}))) as {
    ids?: Array<string>
    all?: boolean
  }

  if (body.all === true) {
    await db
      .update(schema.notifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(schema.notifications.userId, session.user.id),
          isNull(schema.notifications.readAt),
        ),
      )
    await cache.del(notificationsUnreadCacheKey(session.user.id))
    return c.json({ ok: true })
  }

  if (body.ids && body.ids.length > 0) {
    // Cap: prevent runaway IN-list. 200 is well above any realistic UI batch.
    if (body.ids.length > 200) return c.json({ error: 'too_many_ids' }, 400)
    await db
      .update(schema.notifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(schema.notifications.userId, session.user.id),
          inArray(schema.notifications.id, body.ids),
        ),
      )
    await cache.del(notificationsUnreadCacheKey(session.user.id))
    return c.json({ ok: true })
  }

  return c.json({ error: 'nothing_to_do' }, 400)
})
