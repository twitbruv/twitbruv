import { Hono } from 'hono'
import { z } from 'zod'
import { and, asc, desc, eq, isNull, lt, sql } from '@workspace/db'
import { schema } from '@workspace/db'
import { assetUrl } from '@workspace/media/s3'
import { requireAuth, type HonoEnv } from '../middleware/session.ts'
import { toPostDto } from '../lib/post-dto.ts'
import { loadViewerFlags } from '../lib/viewer-flags.ts'
import { loadPostMedia } from '../lib/post-media.ts'
import { loadArticleCards } from '../lib/article-cards.ts'
import { loadRepostTargets } from '../lib/repost-targets.ts'
import { loadQuoteTargets } from '../lib/quote-targets.ts'
import { loadPolls } from '../lib/polls.ts'
import { parseCursor } from '../lib/cursor.ts'

export const communitiesRoute = new Hono<HonoEnv>()

const slugSchema = z
  .string()
  .min(2)
  .max(40)
  .regex(/^[a-z0-9-]+$/i, 'lowercase letters, numbers, and hyphens only')
  .transform((s) => s.toLowerCase())
const nameSchema = z.string().trim().min(1).max(80)
const descSchema = z.string().max(280).optional()
const visSchema = z.enum(['public', 'restricted', 'private'])

const createSchema = z.object({
  slug: slugSchema,
  name: nameSchema,
  description: descSchema,
  visibility: visSchema.default('public'),
})
const updateSchema = z.object({
  name: nameSchema.optional(),
  description: descSchema.optional(),
  visibility: visSchema.optional(),
})

interface CommunityDto {
  id: string
  slug: string
  name: string
  description: string | null
  avatarUrl: string | null
  bannerUrl: string | null
  visibility: 'public' | 'restricted' | 'private'
  ownerId: string
  memberCount: number
  createdAt: string
  viewer?: { role: 'owner' | 'mod' | 'member'; pendingApproval: boolean } | null
}

function toDto(
  row: typeof schema.communities.$inferSelect,
  viewer:
    | { role: 'owner' | 'mod' | 'member'; pendingApproval: boolean }
    | null
    | undefined,
  env: import('@workspace/media/env').MediaEnv,
): CommunityDto {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    avatarUrl: assetUrl(env, row.avatarUrl),
    bannerUrl: assetUrl(env, row.bannerUrl),
    visibility: row.visibility,
    ownerId: row.ownerId,
    memberCount: row.memberCount,
    createdAt: row.createdAt.toISOString(),
    ...(viewer === undefined ? {} : { viewer }),
  }
}

// Index: list public + restricted communities (private ones are hidden from
// non-members). Newest first.
communitiesRoute.get('/', async (c) => {
  const { db, mediaEnv } = c.get('ctx')
  const viewerId = c.get('session')?.user.id
  const limit = Math.min(Number(c.req.query('limit') ?? 30), 100)
  const cursor = parseCursor(c.req.query('cursor'))
  const rows = await db
    .select()
    .from(schema.communities)
    .where(
      and(
        isNull(schema.communities.deletedAt),
        sql`${schema.communities.visibility} <> 'private'`,
        cursor ? lt(schema.communities.createdAt, cursor) : undefined,
      ),
    )
    .orderBy(desc(schema.communities.createdAt))
    .limit(limit)

  let viewerMap = new Map<string, { role: 'owner' | 'mod' | 'member'; pendingApproval: boolean }>()
  if (viewerId && rows.length > 0) {
    const ids = rows.map((r) => r.id)
    const memberships = await db
      .select({
        communityId: schema.communityMembers.communityId,
        role: schema.communityMembers.role,
        pendingApproval: schema.communityMembers.pendingApproval,
      })
      .from(schema.communityMembers)
      .where(
        and(
          eq(schema.communityMembers.userId, viewerId),
          sql`${schema.communityMembers.communityId} = ANY(${ids})`,
        ),
      )
    viewerMap = new Map(
      memberships.map((m) => [
        m.communityId,
        { role: m.role, pendingApproval: m.pendingApproval },
      ]),
    )
  }

  return c.json({
    communities: rows.map((r) => toDto(r, viewerMap.get(r.id) ?? null, mediaEnv)),
    nextCursor:
      rows.length === limit ? rows[rows.length - 1]!.createdAt.toISOString() : null,
  })
})

// Resolve by slug.
communitiesRoute.get('/by/:slug', async (c) => {
  const { db, mediaEnv } = c.get('ctx')
  const viewerId = c.get('session')?.user.id
  const slug = c.req.param('slug').toLowerCase()
  const [row] = await db
    .select()
    .from(schema.communities)
    .where(
      and(eq(schema.communities.slug, slug), isNull(schema.communities.deletedAt)),
    )
    .limit(1)
  if (!row) return c.json({ error: 'not_found' }, 404)

  let viewer:
    | { role: 'owner' | 'mod' | 'member'; pendingApproval: boolean }
    | null
    | undefined = undefined
  if (viewerId) {
    const [m] = await db
      .select({
        role: schema.communityMembers.role,
        pendingApproval: schema.communityMembers.pendingApproval,
      })
      .from(schema.communityMembers)
      .where(
        and(
          eq(schema.communityMembers.communityId, row.id),
          eq(schema.communityMembers.userId, viewerId),
        ),
      )
      .limit(1)
    viewer = m ?? null
  }

  if (row.visibility === 'private' && (!viewer || viewer.pendingApproval)) {
    return c.json({ error: 'not_found' }, 404)
  }

  return c.json({ community: toDto(row, viewer, mediaEnv) })
})

communitiesRoute.post('/', requireAuth(), async (c) => {
  const session = c.get('session')!
  const { db, mediaEnv } = c.get('ctx')
  const body = createSchema.parse(await c.req.json())
  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(schema.communities)
        .values({
          slug: body.slug,
          name: body.name,
          description: body.description ?? null,
          visibility: body.visibility,
          ownerId: session.user.id,
          memberCount: 1,
        })
        .returning()
      if (!row) return c.json({ error: 'insert_failed' }, 500)
      await tx.insert(schema.communityMembers).values({
        communityId: row.id,
        userId: session.user.id,
        role: 'owner',
      })
      return c.json(
        {
          community: toDto(
            row,
            { role: 'owner', pendingApproval: false },
            mediaEnv,
          ),
        },
        201,
      )
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : ''
    if (message.includes('communities_slug_uq')) {
      return c.json({ error: 'slug_taken' }, 409)
    }
    throw err
  }
})

communitiesRoute.patch('/:id', requireAuth(), async (c) => {
  const session = c.get('session')!
  const { db, mediaEnv } = c.get('ctx')
  const id = c.req.param('id')
  const body = updateSchema.parse(await c.req.json())
  const [row] = await db
    .update(schema.communities)
    .set({
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.description !== undefined
        ? { description: body.description ?? null }
        : {}),
      ...(body.visibility !== undefined ? { visibility: body.visibility } : {}),
    })
    .where(
      and(
        eq(schema.communities.id, id),
        eq(schema.communities.ownerId, session.user.id),
      ),
    )
    .returning()
  if (!row) return c.json({ error: 'forbidden' }, 403)
  return c.json({
    community: toDto(row, { role: 'owner', pendingApproval: false }, mediaEnv),
  })
})

communitiesRoute.delete('/:id', requireAuth(), async (c) => {
  const session = c.get('session')!
  const { db } = c.get('ctx')
  const id = c.req.param('id')
  const [row] = await db
    .update(schema.communities)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(schema.communities.id, id),
        eq(schema.communities.ownerId, session.user.id),
        isNull(schema.communities.deletedAt),
      ),
    )
    .returning({ id: schema.communities.id })
  if (!row) return c.json({ error: 'not_found' }, 404)
  return c.json({ ok: true })
})

// Membership: join, leave, approve, list members.
communitiesRoute.post('/:id/join', requireAuth(), async (c) => {
  const session = c.get('session')!
  const { db } = c.get('ctx')
  const id = c.req.param('id')
  return await db.transaction(async (tx) => {
    const [comm] = await tx
      .select()
      .from(schema.communities)
      .where(eq(schema.communities.id, id))
      .limit(1)
    if (!comm || comm.deletedAt) return c.json({ error: 'not_found' }, 404)
    const pending = comm.visibility === 'restricted' || comm.visibility === 'private'
    const inserted = await tx
      .insert(schema.communityMembers)
      .values({
        communityId: id,
        userId: session.user.id,
        role: 'member',
        pendingApproval: pending,
      })
      .onConflictDoNothing()
      .returning({ userId: schema.communityMembers.userId })
    if (inserted.length > 0 && !pending) {
      await tx
        .update(schema.communities)
        .set({ memberCount: sql`${schema.communities.memberCount} + 1` })
        .where(eq(schema.communities.id, id))
    }
    return c.json({ ok: true, pendingApproval: pending })
  })
})

communitiesRoute.post('/:id/leave', requireAuth(), async (c) => {
  const session = c.get('session')!
  const { db } = c.get('ctx')
  const id = c.req.param('id')
  return await db.transaction(async (tx) => {
    const [member] = await tx
      .select({
        role: schema.communityMembers.role,
        pendingApproval: schema.communityMembers.pendingApproval,
      })
      .from(schema.communityMembers)
      .where(
        and(
          eq(schema.communityMembers.communityId, id),
          eq(schema.communityMembers.userId, session.user.id),
        ),
      )
      .limit(1)
    if (!member) return c.json({ ok: true })
    if (member.role === 'owner') {
      return c.json({ error: 'owner_cannot_leave' }, 400)
    }
    await tx
      .delete(schema.communityMembers)
      .where(
        and(
          eq(schema.communityMembers.communityId, id),
          eq(schema.communityMembers.userId, session.user.id),
        ),
      )
    if (!member.pendingApproval) {
      await tx
        .update(schema.communities)
        .set({
          memberCount: sql`GREATEST(${schema.communities.memberCount} - 1, 0)`,
        })
        .where(eq(schema.communities.id, id))
    }
    return c.json({ ok: true })
  })
})

// Owner / mod: approve a pending member.
communitiesRoute.post('/:id/members/:userId/approve', requireAuth(), async (c) => {
  const session = c.get('session')!
  const { db } = c.get('ctx')
  const id = c.req.param('id')
  const userId = c.req.param('userId')

  return await db.transaction(async (tx) => {
    const [meRow] = await tx
      .select({ role: schema.communityMembers.role })
      .from(schema.communityMembers)
      .where(
        and(
          eq(schema.communityMembers.communityId, id),
          eq(schema.communityMembers.userId, session.user.id),
        ),
      )
      .limit(1)
    if (!meRow || (meRow.role !== 'owner' && meRow.role !== 'mod')) {
      return c.json({ error: 'forbidden' }, 403)
    }
    const updated = await tx
      .update(schema.communityMembers)
      .set({ pendingApproval: false })
      .where(
        and(
          eq(schema.communityMembers.communityId, id),
          eq(schema.communityMembers.userId, userId),
          eq(schema.communityMembers.pendingApproval, true),
        ),
      )
      .returning({ userId: schema.communityMembers.userId })
    if (updated.length > 0) {
      await tx
        .update(schema.communities)
        .set({ memberCount: sql`${schema.communities.memberCount} + 1` })
        .where(eq(schema.communities.id, id))
    }
    return c.json({ ok: true })
  })
})

communitiesRoute.get('/:id/members', async (c) => {
  const { db, mediaEnv } = c.get('ctx')
  const id = c.req.param('id')
  const rows = await db
    .select({
      user: schema.users,
      role: schema.communityMembers.role,
      joinedAt: schema.communityMembers.joinedAt,
      pendingApproval: schema.communityMembers.pendingApproval,
    })
    .from(schema.communityMembers)
    .innerJoin(schema.users, eq(schema.users.id, schema.communityMembers.userId))
    .where(
      and(
        eq(schema.communityMembers.communityId, id),
        isNull(schema.users.deletedAt),
        // Default view excludes pending requests (those need a separate filter).
        eq(schema.communityMembers.pendingApproval, false),
      ),
    )
    .orderBy(asc(schema.communityMembers.joinedAt))
    .limit(200)
  return c.json({
    members: rows.map((r) => ({
      id: r.user.id,
      handle: r.user.handle,
      displayName: r.user.displayName,
      avatarUrl: assetUrl(mediaEnv, r.user.avatarUrl),
      isVerified: r.user.isVerified,
      role: r.role,
      joinedAt: r.joinedAt.toISOString(),
    })),
  })
})

// Community feed. Visible to everyone for public/restricted communities; only
// to members for private ones. Reverse chrono on the membership row's
// added_at, mirroring profile feeds.
communitiesRoute.get('/:id/timeline', async (c) => {
  const { db, mediaEnv } = c.get('ctx')
  const viewerId = c.get('session')?.user.id
  const id = c.req.param('id')
  const limit = Math.min(Number(c.req.query('limit') ?? 40), 100)
  const cursor = parseCursor(c.req.query('cursor'))

  const [comm] = await db
    .select({
      id: schema.communities.id,
      visibility: schema.communities.visibility,
      deletedAt: schema.communities.deletedAt,
    })
    .from(schema.communities)
    .where(eq(schema.communities.id, id))
    .limit(1)
  if (!comm || comm.deletedAt) return c.json({ error: 'not_found' }, 404)

  if (comm.visibility === 'private') {
    if (!viewerId) return c.json({ error: 'not_found' }, 404)
    const [m] = await db
      .select({ pendingApproval: schema.communityMembers.pendingApproval })
      .from(schema.communityMembers)
      .where(
        and(
          eq(schema.communityMembers.communityId, id),
          eq(schema.communityMembers.userId, viewerId),
        ),
      )
      .limit(1)
    if (!m || m.pendingApproval) return c.json({ error: 'not_found' }, 404)
  }

  const rows = await db
    .select({
      post: schema.posts,
      author: schema.users,
      addedAt: schema.communityPosts.addedAt,
    })
    .from(schema.communityPosts)
    .innerJoin(schema.posts, eq(schema.posts.id, schema.communityPosts.postId))
    .innerJoin(schema.users, eq(schema.users.id, schema.posts.authorId))
    .where(
      and(
        eq(schema.communityPosts.communityId, id),
        isNull(schema.posts.deletedAt),
        cursor ? lt(schema.communityPosts.addedAt, cursor) : undefined,
      ),
    )
    .orderBy(desc(schema.communityPosts.addedAt))
    .limit(limit)

  const ids = rows.map((r) => r.post.id)
  const [flags, mediaMap, articleMap, repostMap, quoteMap, pollMap] = await Promise.all([
    loadViewerFlags(db, viewerId, ids),
    loadPostMedia(db, ids),
    loadArticleCards(db, ids),
    loadRepostTargets({
      db,
      viewerId,
      env: mediaEnv,
      repostRows: rows.map((r) => ({ id: r.post.id, repostOfId: r.post.repostOfId })),
    }),
    loadQuoteTargets({
      db,
      viewerId,
      env: mediaEnv,
      quoteRows: rows.map((r) => ({ id: r.post.id, quoteOfId: r.post.quoteOfId })),
    }),
    loadPolls(db, viewerId, ids),
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
  const nextCursor =
    rows.length === limit ? rows[rows.length - 1]!.addedAt.toISOString() : null
  return c.json({ posts, nextCursor })
})

// Post into a community. Currently the post itself goes through the regular
// /api/posts flow; this endpoint just attaches an existing post id to the
// community after verifying membership + uniqueness.
communitiesRoute.post('/:id/posts/:postId', requireAuth(), async (c) => {
  const session = c.get('session')!
  const { db } = c.get('ctx')
  const id = c.req.param('id')
  const postId = c.req.param('postId')

  return await db.transaction(async (tx) => {
    const [comm] = await tx
      .select()
      .from(schema.communities)
      .where(eq(schema.communities.id, id))
      .limit(1)
    if (!comm || comm.deletedAt) return c.json({ error: 'not_found' }, 404)

    const [member] = await tx
      .select({
        role: schema.communityMembers.role,
        pendingApproval: schema.communityMembers.pendingApproval,
      })
      .from(schema.communityMembers)
      .where(
        and(
          eq(schema.communityMembers.communityId, id),
          eq(schema.communityMembers.userId, session.user.id),
        ),
      )
      .limit(1)
    if (!member || member.pendingApproval) {
      return c.json({ error: 'not_a_member' }, 403)
    }

    const [post] = await tx
      .select({ id: schema.posts.id, authorId: schema.posts.authorId })
      .from(schema.posts)
      .where(eq(schema.posts.id, postId))
      .limit(1)
    if (!post) return c.json({ error: 'post_not_found' }, 404)
    if (post.authorId !== session.user.id) {
      return c.json({ error: 'not_post_author' }, 403)
    }

    const inserted = await tx
      .insert(schema.communityPosts)
      .values({ communityId: id, postId })
      .onConflictDoNothing()
      .returning({ postId: schema.communityPosts.postId })
    if (inserted.length === 0) return c.json({ error: 'already_in_community' }, 409)
    return c.json({ ok: true })
  })
})
