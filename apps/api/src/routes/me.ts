import { Hono } from 'hono'
import { and, desc, eq, isNull, lt, sql } from '@workspace/db'
import { schema } from '@workspace/db'
import {
  updateProfileSchema,
  claimHandleSchema,
  updateExperimentsSchema,
  resolveExperiments,
  type ExperimentPrefs,
  pushRegisterBodySchema,
  pushUnregisterBodySchema,
} from '@workspace/validators'
import { assetUrl, extractKey } from '@workspace/media/s3'
import { requireAuth, type HonoEnv } from '../middleware/session.ts'
import { isReservedHandle } from '../lib/handles.ts'
import { toPostDto } from '../lib/post-dto.ts'
import { loadViewerFlags } from '../lib/viewer-flags.ts'
import { loadPostMedia } from '../lib/post-media.ts'
import { loadArticleCards } from '../lib/article-cards.ts'
import { loadRepostTargets } from '../lib/repost-targets.ts'
import { loadQuoteTargets } from '../lib/quote-targets.ts'
import { attachReplyParents } from '../lib/reply-parents.ts'
import { loadPolls } from '../lib/polls.ts'
import { loadUnfurlCards } from '../lib/unfurl-cards.ts'
import { parseCursor } from '../lib/cursor.ts'
import { markOnline } from '../lib/presence.ts'

export const meRoute = new Hono<HonoEnv>()

meRoute.use('*', requireAuth())

meRoute.get('/', async (c) => {
  const session = c.get('session')!
  const { db, cache } = c.get('ctx')
  const rows = await db
    .select({ user: schema.users, priv: schema.profilePrivate })
    .from(schema.users)
    .leftJoin(schema.profilePrivate, eq(schema.profilePrivate.userId, schema.users.id))
    .where(eq(schema.users.id, session.user.id))
    .limit(1)
  const row = rows[0]
  if (!row) return c.json({ error: 'not_found' }, 404)
  const user = row.user
  if (user.banned || user.deletedAt) return c.json({ error: 'unauthorized' }, 401)
  void markOnline(cache, user.id)
  return c.json({
    user: toSelfDto(user, c.get('ctx').mediaEnv, row.priv?.experimentPrefs as ExperimentPrefs | null),
  })
})

meRoute.patch('/', async (c) => {
  const session = c.get('session')!
  const { db, rateLimit } = c.get('ctx')
  await rateLimit(c, 'me.update')
  const raw = await c.req.json()
  const body = updateProfileSchema.parse(raw)

  // Only write columns that were explicitly included in the request body. Empty string is
  // treated as "clear this field" (→ null). Missing keys are left untouched.
  const patch: Partial<typeof schema.users.$inferInsert> = { updatedAt: new Date() }
  const has = (k: string) => Object.prototype.hasOwnProperty.call(raw, k)
  // Empty string from the client means "clear this field" → store NULL.
  if (has('displayName')) patch.displayName = body.displayName || null
  if (has('bio')) patch.bio = body.bio || null
  if (has('location')) patch.location = body.location || null
  if (has('websiteUrl')) patch.websiteUrl = body.websiteUrl || null
  // Store the bare object key so we never have to migrate when the asset host changes.
  if (has('avatarUrl'))
    patch.avatarUrl = body.avatarUrl ? extractKey(c.get('ctx').mediaEnv, body.avatarUrl) : null
  if (has('bannerUrl'))
    patch.bannerUrl = body.bannerUrl ? extractKey(c.get('ctx').mediaEnv, body.bannerUrl) : null
  if (has('birthday')) patch.birthday = body.birthday || null
  if (has('timezone')) patch.timezone = body.timezone ?? null
  if (has('locale')) patch.locale = body.locale ?? 'en'

  const [user] = await db
    .update(schema.users)
    .set(patch)
    .where(eq(schema.users.id, session.user.id))
    .returning()
  if (!user) return c.json({ error: 'not_found' }, 404)
  c.get('ctx').track('profile_updated', session.user.id)
  const priv = await loadExperimentPrefs(db, session.user.id)
  return c.json({ user: toSelfDto(user, c.get('ctx').mediaEnv, priv) })
})

meRoute.post('/handle', async (c) => {
  const session = c.get('session')!
  const { db, rateLimit } = c.get('ctx')
  await rateLimit(c, 'me.handle-claim')
  const { handle } = claimHandleSchema.parse(await c.req.json())
  if (isReservedHandle(handle)) return c.json({ error: 'reserved_handle' }, 400)

  const existing = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.handle, handle))
    .limit(1)
  if (existing.length > 0) return c.json({ error: 'handle_taken' }, 409)

  const [user] = await db
    .update(schema.users)
    .set({ handle, updatedAt: new Date() })
    .where(eq(schema.users.id, session.user.id))
    .returning()
  if (!user) return c.json({ error: 'not_found' }, 404)
  c.get('ctx').track('handle_claimed', session.user.id)
  const priv = await loadExperimentPrefs(db, session.user.id)
  return c.json({ user: toSelfDto(user, c.get('ctx').mediaEnv, priv) })
})

meRoute.post('/push/register', async (c) => {
  const session = c.get('session')!
  const { db, rateLimit } = c.get('ctx')
  await rateLimit(c, 'me.push-register')
  const body = pushRegisterBodySchema.parse(await c.req.json())
  await db
    .insert(schema.deviceTokens)
    .values({
      userId: session.user.id,
      token: body.token,
      bundleId: body.bundleId,
      environment: body.environment,
      appVersion: body.appVersion ?? null,
      osVersion: body.osVersion ?? null,
      lastSeenAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [schema.deviceTokens.token, schema.deviceTokens.environment],
      set: {
        userId: session.user.id,
        bundleId: body.bundleId,
        appVersion: body.appVersion ?? null,
        osVersion: body.osVersion ?? null,
        lastSeenAt: new Date(),
      },
    })
  return c.json({ ok: true })
})

meRoute.delete('/push/register', async (c) => {
  const session = c.get('session')!
  const { db, rateLimit } = c.get('ctx')
  await rateLimit(c, 'me.push-register')
  const body = pushUnregisterBodySchema.parse(await c.req.json())
  await db
    .delete(schema.deviceTokens)
    .where(
      and(
        eq(schema.deviceTokens.userId, session.user.id),
        eq(schema.deviceTokens.token, body.token),
      ),
    )
  return c.json({ ok: true })
})

// Users I've blocked. Newest first. Used by settings → Privacy so users can audit and
// unblock without remembering exact handles.
meRoute.get('/blocks', async (c) => {
  const session = c.get('session')!
  const { db, mediaEnv } = c.get('ctx')
  const limit = Math.min(Number(c.req.query('limit') ?? 50), 100)
  const cursor = c.req.query('cursor')

  const rows = await db
    .select({ user: schema.users, block: schema.blocks })
    .from(schema.blocks)
    .innerJoin(schema.users, eq(schema.users.id, schema.blocks.blockedId))
    .where(
      and(
        eq(schema.blocks.blockerId, session.user.id),
        isNull(schema.users.deletedAt),
        cursor ? lt(schema.blocks.createdAt, new Date(cursor)) : undefined,
      ),
    )
    .orderBy(desc(schema.blocks.createdAt))
    .limit(limit)
  const users = rows.map((r) => ({
    id: r.user.id,
    handle: r.user.handle,
    displayName: r.user.displayName,
    avatarUrl: assetUrl(mediaEnv, r.user.avatarUrl),
    isVerified: r.user.isVerified,
    role: r.user.role,
    blockedAt: r.block.createdAt.toISOString(),
  }))
  const nextCursor =
    rows.length === limit ? rows[rows.length - 1]!.block.createdAt.toISOString() : null
  return c.json({ users, nextCursor })
})

// Users I've muted, with the mute scope so the UI can show whether they're hidden from
// feed only, notifications only, or both.
meRoute.get('/mutes', async (c) => {
  const session = c.get('session')!
  const { db, mediaEnv } = c.get('ctx')
  const limit = Math.min(Number(c.req.query('limit') ?? 50), 100)
  const cursor = c.req.query('cursor')

  const rows = await db
    .select({ user: schema.users, mute: schema.mutes })
    .from(schema.mutes)
    .innerJoin(schema.users, eq(schema.users.id, schema.mutes.mutedId))
    .where(
      and(
        eq(schema.mutes.muterId, session.user.id),
        isNull(schema.users.deletedAt),
        cursor ? lt(schema.mutes.createdAt, new Date(cursor)) : undefined,
      ),
    )
    .orderBy(desc(schema.mutes.createdAt))
    .limit(limit)
  const users = rows.map((r) => ({
    id: r.user.id,
    handle: r.user.handle,
    displayName: r.user.displayName,
    avatarUrl: assetUrl(mediaEnv, r.user.avatarUrl),
    isVerified: r.user.isVerified,
    role: r.user.role,
    mutedAt: r.mute.createdAt.toISOString(),
    scope: r.mute.scope,
  }))
  const nextCursor =
    rows.length === limit ? rows[rows.length - 1]!.mute.createdAt.toISOString() : null
  return c.json({ users, nextCursor })
})

// Viewer's bookmarked posts, newest bookmark first.
meRoute.get('/bookmarks', async (c) => {
  const session = c.get('session')!
  const { db, mediaEnv } = c.get('ctx')
  const limit = Math.min(Number(c.req.query('limit') ?? 40), 100)
  const cursor = parseCursor(c.req.query('cursor'))

  const rows = await db
    .select({ post: schema.posts, author: schema.users, bookmarkedAt: schema.bookmarks.createdAt })
    .from(schema.bookmarks)
    .innerJoin(schema.posts, eq(schema.posts.id, schema.bookmarks.postId))
    .innerJoin(schema.users, eq(schema.users.id, schema.posts.authorId))
    .where(
      and(
        eq(schema.bookmarks.userId, session.user.id),
        isNull(schema.posts.deletedAt),
        cursor ? lt(schema.bookmarks.createdAt, cursor) : undefined,
      ),
    )
    .orderBy(desc(schema.bookmarks.createdAt))
    .limit(limit)

  const ids = rows.map((r) => r.post.id)
  const [flags, mediaMap, articleMap, repostMap, quoteMap, pollMap] = await Promise.all([
    loadViewerFlags(db, session.user.id, ids),
    loadPostMedia(db, ids),
    loadArticleCards(db, ids),
    loadRepostTargets({
      db,
      viewerId: session.user.id,
      env: mediaEnv,
      repostRows: rows.map((r) => ({ id: r.post.id, repostOfId: r.post.repostOfId })),
    }),
    loadQuoteTargets({
      db,
      viewerId: session.user.id,
      env: mediaEnv,
      quoteRows: rows.map((r) => ({ id: r.post.id, quoteOfId: r.post.quoteOfId })),
    }),
    loadPolls(db, session.user.id, ids),
  ])
  const unfurlCardsMap = await loadUnfurlCards(db, ids, articleMap)
  const posts = rows.map((r) =>
    toPostDto(
      r.post,
      r.author,
      flags.get(r.post.id),
      mediaMap.get(r.post.id),
      mediaEnv,
      unfurlCardsMap.get(r.post.id),
      repostMap.get(r.post.id),
      quoteMap.get(r.post.id),
      pollMap.get(r.post.id),
    ),
  )
  await attachReplyParents({ db, viewerId: session.user.id, env: mediaEnv, posts })
  const nextCursor = rows.length === limit ? rows[rows.length - 1]!.bookmarkedAt.toISOString() : null
  return c.json({ posts, nextCursor })
})

meRoute.patch('/experiments', async (c) => {
  const session = c.get('session')!
  const { db, rateLimit } = c.get('ctx')
  await rateLimit(c, 'me.update')
  const body = updateExperimentsSchema.parse(await c.req.json())

  const [row] = await db
    .insert(schema.profilePrivate)
    .values({
      userId: session.user.id,
      experimentPrefs: body,
    })
    .onConflictDoUpdate({
      target: schema.profilePrivate.userId,
      set: {
        experimentPrefs: sql`coalesce(${schema.profilePrivate.experimentPrefs}, '{}'::jsonb) || excluded.experiment_prefs`,
      },
    })
    .returning({ experimentPrefs: schema.profilePrivate.experimentPrefs })

  return c.json({
    experiments: resolveExperiments(row?.experimentPrefs as ExperimentPrefs | null),
  })
})

async function loadExperimentPrefs(
  db: import('@workspace/db').Database,
  userId: string,
): Promise<ExperimentPrefs | null> {
  const rows = await db
    .select({ experimentPrefs: schema.profilePrivate.experimentPrefs })
    .from(schema.profilePrivate)
    .where(eq(schema.profilePrivate.userId, userId))
    .limit(1)
  return (rows[0]?.experimentPrefs as ExperimentPrefs | null) ?? null
}

function toSelfDto(
  u: typeof schema.users.$inferSelect,
  env: import('@workspace/media/env').MediaEnv,
  experimentPrefs?: ExperimentPrefs | null,
) {
  return {
    id: u.id,
    email: u.email,
    emailVerified: u.emailVerified,
    handle: u.handle,
    displayName: u.displayName,
    bio: u.bio,
    location: u.location,
    websiteUrl: u.websiteUrl,
    avatarUrl: assetUrl(env, u.avatarUrl),
    bannerUrl: assetUrl(env, u.bannerUrl),
    birthday: u.birthday,
    isVerified: u.isVerified,
    isBot: u.isBot,
    role: u.role,
    locale: u.locale,
    timezone: u.timezone,
    createdAt: u.createdAt,
    experiments: resolveExperiments(experimentPrefs),
  }
}
