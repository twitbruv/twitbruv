import { Hono } from 'hono'
import { and, desc, eq, inArray, isNull, lt, ne, sql } from '@workspace/db'
import { schema } from '@workspace/db'
import { assetUrl } from '@workspace/media/s3'
import { requireHandle, type HonoEnv } from '../middleware/session.ts'
import { notificationsUnreadCacheKey } from '../lib/notify.ts'
import { parseCursor } from '../lib/cursor.ts'
import { toPostDto, type PostDto } from '../lib/post-dto.ts'
import { loadPostMedia } from '../lib/post-media.ts'
import { loadArticleCards } from '../lib/article-cards.ts'
import { loadUnfurlCards } from '../lib/unfurl-cards.ts'
import { loadViewerFlags } from '../lib/viewer-flags.ts'

export const notificationsRoute = new Hono<HonoEnv>()

notificationsRoute.use('*', requireHandle())

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
  // DMs are excluded — the messages tab carries its own unread count via
  // /api/dms/unread-count and shouldn't double-count here.
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.notifications)
    .where(
      and(
        eq(schema.notifications.userId, session.user.id),
        isNull(schema.notifications.readAt),
        ne(schema.notifications.kind, 'dm'),
      ),
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

  // DMs aren't surfaced here — they live in the messages tab with their own unread count.
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
        ne(schema.notifications.kind, 'dm'),
        unreadOnly ? isNull(schema.notifications.readAt) : undefined,
        cursor ? lt(schema.notifications.createdAt, cursor) : undefined,
      ),
    )
    .orderBy(desc(schema.notifications.createdAt))
    .limit(limit)

  // Hydrate the post referenced by each notification so the UI can render a card preview.
  // For replies / mentions / quotes the entity is the new post that triggered the notif;
  // for likes / reposts it's the original (recipient's) post that was engaged with.
  const postIds = Array.from(
    new Set(
      rows
        .filter((r) => r.n.entityType === 'post' && r.n.entityId)
        .map((r) => r.n.entityId as string),
    ),
  )

  const [postRows, mediaMap, articleMap, viewerFlags] = await Promise.all([
    postIds.length > 0
      ? db
          .select({ post: schema.posts, author: schema.users })
          .from(schema.posts)
          .innerJoin(schema.users, eq(schema.users.id, schema.posts.authorId))
          .where(and(inArray(schema.posts.id, postIds), isNull(schema.posts.deletedAt)))
      : Promise.resolve([]),
    loadPostMedia(db, postIds),
    loadArticleCards(db, postIds),
    loadViewerFlags(db, session.user.id, postIds),
  ])
  const unfurlCardsMap = await loadUnfurlCards(db, postIds, articleMap)

  const postById = new Map<string, PostDto>()
  for (const r of postRows) {
    postById.set(
      r.post.id,
      toPostDto(
        r.post,
        r.author,
        viewerFlags.get(r.post.id),
        mediaMap.get(r.post.id),
        mediaEnv,
        unfurlCardsMap.get(r.post.id),
        undefined,
        undefined,
        undefined,
      ),
    )
  }

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
          role: r.actor.role,
        }
      : null,
    target:
      r.n.entityType === 'post' && r.n.entityId ? postById.get(r.n.entityId) ?? null : null,
  }))
  const nextCursor = rows.length === limit ? rows[rows.length - 1]!.n.createdAt.toISOString() : null
  return c.json({ notifications: items, nextCursor })
})

notificationsRoute.post('/mark-read', async (c) => {
  const session = c.get('session')!
  const { db, cache, rateLimit } = c.get('ctx')
  await rateLimit(c, 'notifications.write')
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
