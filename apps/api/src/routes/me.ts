import { Hono } from 'hono'
import { z } from 'zod'
import { and, asc, desc, eq, isNull, lt, sql } from '@workspace/db'
import { schema } from '@workspace/db'
import { updateProfileSchema, claimHandleSchema } from '@workspace/validators'
import { assetUrl, extractKey } from '@workspace/media/s3'
import { requireAuth, type HonoEnv } from '../middleware/session.ts'
import { isReservedHandle } from '../lib/handles.ts'
import { toPostDto } from '../lib/post-dto.ts'
import { loadViewerFlags } from '../lib/viewer-flags.ts'
import { loadPostMedia } from '../lib/post-media.ts'
import { loadArticleCards } from '../lib/article-cards.ts'
import { loadRepostTargets } from '../lib/repost-targets.ts'
import { loadQuoteTargets } from '../lib/quote-targets.ts'
import { loadPolls } from '../lib/polls.ts'
import { parseCursor } from '../lib/cursor.ts'

export const meRoute = new Hono<HonoEnv>()

meRoute.use('*', requireAuth())

meRoute.get('/', async (c) => {
  const session = c.get('session')!
  const { db } = c.get('ctx')
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, session.user.id)).limit(1)
  if (!user) return c.json({ error: 'not_found' }, 404)
  return c.json({ user: toSelfDto(user, c.get('ctx').mediaEnv) })
})

meRoute.patch('/', async (c) => {
  const session = c.get('session')!
  const { db } = c.get('ctx')
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
  return c.json({ user: toSelfDto(user, c.get('ctx').mediaEnv) })
})

meRoute.post('/handle', async (c) => {
  const session = c.get('session')!
  const { db } = c.get('ctx')
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
  return c.json({ user: toSelfDto(user, c.get('ctx').mediaEnv) })
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

// Viewer's bookmarked posts, newest bookmark first. The optional ?folder
// query selects either a specific folder by id or the implicit "Unsorted"
// bucket (folder=none). Without a query param, all bookmarks are returned.
meRoute.get('/bookmarks', async (c) => {
  const session = c.get('session')!
  const { db, mediaEnv } = c.get('ctx')
  const limit = Math.min(Number(c.req.query('limit') ?? 40), 100)
  const cursor = parseCursor(c.req.query('cursor'))
  const folderQ = c.req.query('folder')

  const folderFilter =
    folderQ === 'none'
      ? isNull(schema.bookmarks.folderId)
      : folderQ
        ? eq(schema.bookmarks.folderId, folderQ)
        : undefined

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
        folderFilter,
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
  const posts = rows.map((r) =>
    toPostDto(
      r.post,
      r.author,
      flags.get(r.post.id),
      mediaMap.get(r.post.id),
      mediaEnv,
      articleMap.get(r.post.id),
      repostMap.get(r.post.id),
      quoteMap.get(r.post.id),
      pollMap.get(r.post.id),
    ),
  )
  const nextCursor = rows.length === limit ? rows[rows.length - 1]!.bookmarkedAt.toISOString() : null
  return c.json({ posts, nextCursor })
})

// List/create/rename/delete bookmark folders + add/remove a bookmark to/from
// a folder. Folders are private to the viewer; only their owner can read or
// modify them.
meRoute.get('/bookmark-folders', async (c) => {
  const session = c.get('session')!
  const { db } = c.get('ctx')
  const folders = await db
    .select({
      id: schema.bookmarkFolders.id,
      name: schema.bookmarkFolders.name,
      createdAt: schema.bookmarkFolders.createdAt,
    })
    .from(schema.bookmarkFolders)
    .where(eq(schema.bookmarkFolders.userId, session.user.id))
    .orderBy(asc(schema.bookmarkFolders.createdAt))
  // Per-folder counts (including the "unsorted" bucket) so the UI can show
  // counts beside each folder name.
  const folderCounts = await db
    .select({
      folderId: schema.bookmarks.folderId,
      n: sql<number>`count(*)::int`,
    })
    .from(schema.bookmarks)
    .where(eq(schema.bookmarks.userId, session.user.id))
    .groupBy(schema.bookmarks.folderId)
  const totals = new Map<string | null, number>(
    folderCounts.map((r) => [r.folderId, r.n]),
  )
  return c.json({
    folders: folders.map((f) => ({
      id: f.id,
      name: f.name,
      createdAt: f.createdAt.toISOString(),
      bookmarkCount: totals.get(f.id) ?? 0,
    })),
    unsortedCount: totals.get(null) ?? 0,
  })
})

const folderNameSchema = z.string().trim().min(1).max(50)

meRoute.post('/bookmark-folders', async (c) => {
  const session = c.get('session')!
  const { db } = c.get('ctx')
  const body = z.object({ name: folderNameSchema }).parse(await c.req.json())
  const [created] = await db
    .insert(schema.bookmarkFolders)
    .values({ userId: session.user.id, name: body.name })
    .returning()
  if (!created) return c.json({ error: 'insert_failed' }, 500)
  return c.json({
    folder: {
      id: created.id,
      name: created.name,
      createdAt: created.createdAt.toISOString(),
      bookmarkCount: 0,
    },
  })
})

meRoute.patch('/bookmark-folders/:id', async (c) => {
  const session = c.get('session')!
  const { db } = c.get('ctx')
  const id = c.req.param('id')
  const body = z.object({ name: folderNameSchema }).parse(await c.req.json())
  const [updated] = await db
    .update(schema.bookmarkFolders)
    .set({ name: body.name })
    .where(
      and(
        eq(schema.bookmarkFolders.id, id),
        eq(schema.bookmarkFolders.userId, session.user.id),
      ),
    )
    .returning()
  if (!updated) return c.json({ error: 'not_found' }, 404)
  return c.json({
    folder: {
      id: updated.id,
      name: updated.name,
      createdAt: updated.createdAt.toISOString(),
    },
  })
})

meRoute.delete('/bookmark-folders/:id', async (c) => {
  const session = c.get('session')!
  const { db } = c.get('ctx')
  const id = c.req.param('id')
  const result = await db
    .delete(schema.bookmarkFolders)
    .where(
      and(
        eq(schema.bookmarkFolders.id, id),
        eq(schema.bookmarkFolders.userId, session.user.id),
      ),
    )
    .returning({ id: schema.bookmarkFolders.id })
  if (result.length === 0) return c.json({ error: 'not_found' }, 404)
  return c.json({ ok: true })
})

// Move (or remove) a bookmark to/from a folder. The bookmark itself must
// already exist for the viewer; this endpoint never creates new bookmarks.
meRoute.put('/bookmarks/:postId/folder', async (c) => {
  const session = c.get('session')!
  const { db } = c.get('ctx')
  const postId = c.req.param('postId')
  const body = z
    .object({ folderId: z.string().uuid().nullable() })
    .parse(await c.req.json())

  if (body.folderId) {
    const [folder] = await db
      .select({ id: schema.bookmarkFolders.id })
      .from(schema.bookmarkFolders)
      .where(
        and(
          eq(schema.bookmarkFolders.id, body.folderId),
          eq(schema.bookmarkFolders.userId, session.user.id),
        ),
      )
      .limit(1)
    if (!folder) return c.json({ error: 'folder_not_found' }, 404)
  }

  const [updated] = await db
    .update(schema.bookmarks)
    .set({ folderId: body.folderId })
    .where(
      and(
        eq(schema.bookmarks.userId, session.user.id),
        eq(schema.bookmarks.postId, postId),
      ),
    )
    .returning({ postId: schema.bookmarks.postId })
  if (!updated) return c.json({ error: 'bookmark_not_found' }, 404)
  return c.json({ ok: true })
})

function toSelfDto(
  u: typeof schema.users.$inferSelect,
  env: import('@workspace/media/env').MediaEnv,
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
  }
}
