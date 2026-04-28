import { Hono } from 'hono'
import { and, desc, eq, isNull, lt, sql } from '@workspace/db'
import { schema } from '@workspace/db'
import { assetUrl } from '@workspace/media/s3'
import type { HonoEnv } from '../middleware/session.ts'
import { requireHandle } from '../middleware/session.ts'
import { toPostDto, type PostDto } from '../lib/post-dto.ts'
import { loadViewerFlags } from '../lib/viewer-flags.ts'
import { loadPostMedia } from '../lib/post-media.ts'
import { loadArticleCards } from '../lib/article-cards.ts'
import { loadRepostTargets } from '../lib/repost-targets.ts'
import { loadQuoteTargets } from '../lib/quote-targets.ts'
import { attachReplyParents } from '../lib/reply-parents.ts'
import { notify, invalidateUnreadCounts } from '../lib/notify.ts'
import { loadPolls } from '../lib/polls.ts'
import { parseCursor } from '../lib/cursor.ts'
import { homeFeedCacheKey, profileFeedCacheKey } from './feed.ts'
import { getGithubSnapshot } from '../lib/github-snapshot.ts'
import { loadUnfurlCards } from '../lib/unfurl-cards.ts'

export const usersRoute = new Hono<HonoEnv>()

// Suggested accounts for the signed-in viewer. Powers the "Find people" CTA on
// empty feeds and the default state of /search. Ranking strategy:
//   1. Friends-of-friends — people followed by people the viewer follows, ordered
//      by mutual count desc (more shared follows = stronger signal).
//   2. Popular fallback — top accounts by follower count when (1) is sparse.
// Both layers exclude: the viewer themselves, accounts the viewer already
// follows, anyone in a mutual block relationship, anyone the viewer feed-mutes,
// banned/deleted/handle-less accounts, and bots. Mounted BEFORE /:handle so the
// parametric route doesn't swallow the literal segment.
const SUGGESTED_USERS_LIMIT = 12

usersRoute.get('/suggested', requireHandle(), async (c) => {
  const session = c.get('session')!
  const { db, mediaEnv, rateLimit } = c.get('ctx')
  await rateLimit(c, 'reads.profile')
  const me = session.user.id
  const limit = Math.min(Number(c.req.query('limit') ?? SUGGESTED_USERS_LIMIT), 30)

  const exclusions = sql`
    ${schema.users.id} <> ${me}
    AND ${schema.users.deletedAt} IS NULL
    AND ${schema.users.handle} IS NOT NULL
    AND ${schema.users.banned} = false
    AND ${schema.users.isBot} = false
    AND NOT EXISTS (
      SELECT 1 FROM ${schema.follows} f
      WHERE f.follower_id = ${me} AND f.followee_id = ${schema.users.id}
    )
    AND NOT EXISTS (
      SELECT 1 FROM ${schema.blocks} b
      WHERE (b.blocker_id = ${me} AND b.blocked_id = ${schema.users.id})
         OR (b.blocker_id = ${schema.users.id} AND b.blocked_id = ${me})
    )
    AND NOT EXISTS (
      SELECT 1 FROM ${schema.mutes} m
      WHERE m.muter_id = ${me} AND m.muted_id = ${schema.users.id}
        AND (m.scope = 'feed' OR m.scope = 'both')
    )
  `

  const friendsOfFriends = await db
    .select({
      user: schema.users,
      mutuals: sql<number>`count(distinct ff.follower_id)::int`.as('mutuals'),
    })
    .from(schema.users)
    .innerJoin(
      sql`${schema.follows} ff`,
      sql`ff.followee_id = ${schema.users.id}`,
    )
    .where(
      and(
        sql`ff.follower_id IN (
          SELECT followee_id FROM ${schema.follows}
          WHERE follower_id = ${me}
        )`,
        exclusions,
      ),
    )
    .groupBy(schema.users.id)
    .orderBy(sql`count(distinct ff.follower_id) DESC`, desc(schema.users.createdAt))
    .limit(limit)

  const users = friendsOfFriends.map((r) => publicUser(r.user, mediaEnv))

  if (users.length < limit) {
    const have = new Set(users.map((u) => u.id))
    const popular = await db
      .select({
        user: schema.users,
        followers: sql<number>`(
          SELECT count(*)::int FROM ${schema.follows} f2
          WHERE f2.followee_id = ${schema.users.id}
        )`.as('followers'),
      })
      .from(schema.users)
      .where(
        and(
          users.length > 0
            ? sql`${schema.users.id} NOT IN (${sql.join(
                users.map((u) => sql`${u.id}::uuid`),
                sql`, `,
              )})`
            : undefined,
          exclusions,
        ),
      )
      .orderBy(
        sql`(SELECT count(*) FROM ${schema.follows} f2 WHERE f2.followee_id = ${schema.users.id}) DESC`,
        desc(schema.users.createdAt),
      )
      .limit(limit - users.length)
    for (const r of popular) {
      if (have.has(r.user.id)) continue
      users.push(publicUser(r.user, mediaEnv))
    }
  }

  return c.json({ users })
})

async function resolveHandle(db: HonoEnv['Variables']['ctx']['db'], raw: string) {
  const handle = raw.replace(/^@/, '')
  const [user] = await db
    .select()
    .from(schema.users)
    .where(and(eq(schema.users.handle, handle), isNull(schema.users.deletedAt)))
    .limit(1)
  return user ?? null
}

// Public user profile, with counts + viewer-relative flags.
usersRoute.get('/:handle', async (c) => {
  const { db, mediaEnv, rateLimit } = c.get('ctx')
  await rateLimit(c, 'reads.profile')
  const viewerId = c.get('session')?.user.id
  const user = await resolveHandle(db, c.req.param('handle'))
  if (!user) return c.json({ error: 'not_found' }, 404)

  const [[followers], [following], [posts]] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.follows)
      .where(eq(schema.follows.followeeId, user.id)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.follows)
      .where(eq(schema.follows.followerId, user.id)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.posts)
      .where(and(eq(schema.posts.authorId, user.id), isNull(schema.posts.deletedAt))),
  ])

  let viewer: { following: boolean; blocking: boolean; muting: boolean } | undefined
  if (viewerId && viewerId !== user.id) {
    const [[follow], [block], [mute]] = await Promise.all([
      db
        .select({ x: sql<number>`1` })
        .from(schema.follows)
        .where(and(eq(schema.follows.followerId, viewerId), eq(schema.follows.followeeId, user.id)))
        .limit(1),
      db
        .select({ x: sql<number>`1` })
        .from(schema.blocks)
        .where(and(eq(schema.blocks.blockerId, viewerId), eq(schema.blocks.blockedId, user.id)))
        .limit(1),
      db
        .select({ x: sql<number>`1` })
        .from(schema.mutes)
        .where(and(eq(schema.mutes.muterId, viewerId), eq(schema.mutes.mutedId, user.id)))
        .limit(1),
    ])
    viewer = { following: !!follow, blocking: !!block, muting: !!mute }
  }

  return c.json({
    user: {
      id: user.id,
      handle: user.handle,
      displayName: user.displayName,
      bio: user.bio,
      location: user.location,
      websiteUrl: user.websiteUrl,
      avatarUrl: assetUrl(mediaEnv, user.avatarUrl),
      bannerUrl: assetUrl(mediaEnv, user.bannerUrl),
      isVerified: user.isVerified,
      isBot: user.isBot,
      role: user.role,
      createdAt: user.createdAt,
      counts: {
        followers: followers?.n ?? 0,
        following: following?.n ?? 0,
        posts: posts?.n ?? 0,
      },
      ...(viewer ? { viewer } : {}),
    },
  })
})

// Public GitHub snapshot for the profile page. Gated on showOnProfile so users can disconnect
// the public view without revoking the OAuth grant. Only an explicit allow-list of fields is
// returned — never the encrypted token, scopes, or failure reasons.
usersRoute.get('/:handle/github', async (c) => {
  const ctx = c.get('ctx')
  await ctx.rateLimit(c, 'reads.profile')
  const user = await resolveHandle(ctx.db, c.req.param('handle'))
  if (!user) return c.json({ error: 'not_found' }, 404)
  const { snapshot, showOnProfile } = await getGithubSnapshot(ctx, user.id)
  if (!snapshot || !showOnProfile) {
    return c.json({ connected: false })
  }
  return c.json({
    connected: true,
    login: snapshot.login,
    name: snapshot.name,
    htmlUrl: snapshot.htmlUrl,
    avatarUrl: snapshot.avatarUrl,
    followers: snapshot.followers,
    following: snapshot.following,
    publicRepos: snapshot.publicRepos,
    contributions: snapshot.contributions,
    pinned: snapshot.pinned,
    refreshedAt: snapshot.refreshedAt,
    stale: snapshot.stale ?? false,
  })
})

// Profile feed.
const PROFILE_FEED_TTL_SEC = 60

usersRoute.get('/:handle/posts', async (c) => {
  const { db, mediaEnv, cache, rateLimit } = c.get('ctx')
  await rateLimit(c, 'reads.profile')
  const viewerId = c.get('session')?.user.id
  const user = await resolveHandle(db, c.req.param('handle'))
  if (!user) return c.json({ error: 'not_found' }, 404)
  const limit = Math.min(Number(c.req.query('limit') ?? 40), 100)
  const cursor = parseCursor(c.req.query('cursor'))

  // Page-0 cache. Identical post list per author; viewer-relative flags + repost/quote
  // embeds (which carry their own viewer flags) are layered on after the cache lookup.
  // Cached DTOs are pre-serialized so Date fields survive JSON round-trip in the cache.
  const cacheable = !cursor && limit === 40
  type CachedPayload = {
    posts: Array<PostDto>
    nextCursor: string | null
  }

  let payload: CachedPayload | null = null
  if (cacheable) {
    payload = await cache.get<CachedPayload>(profileFeedCacheKey(user.id))
    if (payload) c.header('x-cache', 'hit')
  }

  if (!payload) {
    // Pinned post is promoted to the top of the FIRST page only — once you cursor past it,
    // it's filtered out so it doesn't appear again mid-scroll.
    type Row = {
      post: typeof schema.posts.$inferSelect
      author: typeof schema.users.$inferSelect
    }
    let pinnedRow: Row | null = null
    if (!cursor) {
      const [pinned] = await db
        .select({ post: schema.posts, author: schema.users })
        .from(schema.posts)
        .innerJoin(schema.users, eq(schema.users.id, schema.posts.authorId))
        .where(
          and(
            eq(schema.posts.authorId, user.id),
            isNull(schema.posts.deletedAt),
            eq(schema.posts.visibility, 'public'),
            sql`${schema.posts.pinnedAt} IS NOT NULL`,
          ),
        )
        .limit(1)
      pinnedRow = pinned ?? null
    }

    const rows = await db
      .select({ post: schema.posts, author: schema.users })
      .from(schema.posts)
      .innerJoin(schema.users, eq(schema.users.id, schema.posts.authorId))
      .where(
        and(
          eq(schema.posts.authorId, user.id),
          isNull(schema.posts.deletedAt),
          eq(schema.posts.visibility, 'public'),
          // Don't double-render the pinned post in the date-ordered list.
          pinnedRow ? sql`${schema.posts.id} <> ${pinnedRow.post.id}` : undefined,
          cursor ? lt(schema.posts.createdAt, cursor) : undefined,
        ),
      )
      .orderBy(desc(schema.posts.createdAt))
      .limit(limit)

    const allRows: Array<Row> = pinnedRow ? [pinnedRow, ...rows] : rows
    const nextCursor =
      rows.length === limit ? rows[rows.length - 1]!.post.createdAt.toISOString() : null

    // Build viewer-independent DTOs (no viewer flags, no repost/quote embeds — those are
    // layered on after, since they vary per viewer).
    const ids = allRows.map((r) => r.post.id)
    const [mediaMap, articleMap] = await Promise.all([
      loadPostMedia(db, ids),
      loadArticleCards(db, ids),
    ])
    const unfurlCardsMap = await loadUnfurlCards(db, ids, articleMap)
    const cachedPosts: Array<PostDto> = allRows.map((r) => {
      const dto = toPostDto(
        r.post,
        r.author,
        undefined,
        mediaMap.get(r.post.id),
        mediaEnv,
        unfurlCardsMap.get(r.post.id),
        undefined,
        undefined,
        undefined,

      )
      if (pinnedRow && r.post.id === pinnedRow.post.id) {
        ;(dto as { pinned?: boolean }).pinned = true
      }
      return dto
    })

    payload = { posts: cachedPosts, nextCursor }

    if (cacheable) {
      await cache.set(profileFeedCacheKey(user.id), payload, PROFILE_FEED_TTL_SEC)
      c.header('x-cache', 'miss')
    }
  }

  const ids = payload.posts.map((p) => p.id)
  const [flags, repostMap, quoteMap, pollMap] = await Promise.all([
    loadViewerFlags(db, viewerId, ids),
    loadRepostTargets({
      db,
      viewerId,
      env: mediaEnv,
      repostRows: payload.posts.map((p) => ({ id: p.id, repostOfId: p.repostOfId })),
    }),
    loadQuoteTargets({
      db,
      viewerId,
      env: mediaEnv,
      quoteRows: payload.posts.map((p) => ({ id: p.id, quoteOfId: p.quoteOfId })),
    }),
    loadPolls(db, viewerId, ids),
  ])
  const posts: Array<PostDto> = payload.posts.map((p) => {
    const viewer = flags.get(p.id)
    const repostOf = repostMap.get(p.id)
    const quoteOf = quoteMap.get(p.id)
    const poll = pollMap.get(p.id)
    return {
      ...p,
      ...(viewer ? { viewer } : {}),
      ...(repostOf ? { repostOf } : {}),
      ...(quoteOf ? { quoteOf } : {}),
      ...(poll ? { poll } : {}),
    }
  })
  await attachReplyParents({ db, viewerId, env: mediaEnv, posts })
  return c.json({ posts, nextCursor: payload.nextCursor })
})

// Author's published articles list.
usersRoute.get('/:handle/articles', async (c) => {
  const { db } = c.get('ctx')
  const user = await resolveHandle(db, c.req.param('handle'))
  if (!user) return c.json({ error: 'not_found' }, 404)
  const limit = Math.min(Number(c.req.query('limit') ?? 40), 100)
  const cursor = parseCursor(c.req.query('cursor'))
  const rows = await db
    .select()
    .from(schema.articles)
    .where(
      and(
        eq(schema.articles.authorId, user.id),
        eq(schema.articles.status, 'published'),
        isNull(schema.articles.deletedAt),
        cursor ? lt(schema.articles.publishedAt, cursor) : undefined,
      ),
    )
    .orderBy(desc(schema.articles.publishedAt))
    .limit(limit)
  return c.json({
    articles: rows.map((a) => ({
      id: a.id,
      slug: a.slug,
      title: a.title,
      subtitle: a.subtitle,
      readingMinutes: a.readingMinutes,
      publishedAt: a.publishedAt?.toISOString() ?? null,
    })),
    nextCursor: rows.length === limit ? rows[rows.length - 1]!.publishedAt?.toISOString() ?? null : null,
  })
})

// Public article by author + slug.
usersRoute.get('/:handle/articles/:slug', async (c) => {
  const { db, mediaEnv } = c.get('ctx')
  const user = await resolveHandle(db, c.req.param('handle'))
  if (!user) return c.json({ error: 'not_found' }, 404)
  const slug = c.req.param('slug')
  const [article] = await db
    .select()
    .from(schema.articles)
    .where(
      and(
        eq(schema.articles.authorId, user.id),
        eq(schema.articles.slug, slug),
        eq(schema.articles.status, 'published'),
        isNull(schema.articles.deletedAt),
      ),
    )
    .limit(1)
  if (!article) return c.json({ error: 'not_found' }, 404)
  let coverUrl: string | null = null
  if (article.coverMediaId) {
    const [cover] = await db
      .select()
      .from(schema.media)
      .where(eq(schema.media.id, article.coverMediaId))
      .limit(1)
    const variants = Array.isArray(cover?.variants)
      ? (cover.variants as Array<{ kind: string; key: string }>)
      : []
    const key =
      variants.find((v) => v.kind === 'large')?.key ??
      variants.find((v) => v.kind === 'medium')?.key ??
      null
    coverUrl = key ? assetUrl(mediaEnv, key) : null
  }
  return c.json({
    article: {
      id: article.id,
      slug: article.slug,
      title: article.title,
      subtitle: article.subtitle,
      bodyFormat: article.bodyFormat,
      bodyJson: article.bodyJson,
      bodyText: article.bodyText,
      readingMinutes: article.readingMinutes,
      wordCount: article.wordCount,
      publishedAt: article.publishedAt?.toISOString() ?? null,
      editedAt: article.editedAt?.toISOString() ?? null,
      likeCount: article.likeCount,
      bookmarkCount: article.bookmarkCount,
      replyCount: article.replyCount,
      coverMediaId: article.coverMediaId,
      coverUrl,
      author: {
        id: user.id,
        handle: user.handle,
        displayName: user.displayName,
        avatarUrl: assetUrl(mediaEnv, user.avatarUrl),
        isVerified: user.isVerified,
        role: user.role,
      },
    },
  })
})

// Followers list (paginated).
usersRoute.get('/:handle/followers', async (c) => {
  const { db, mediaEnv } = c.get('ctx')
  const user = await resolveHandle(db, c.req.param('handle'))
  if (!user) return c.json({ error: 'not_found' }, 404)
  const limit = Math.min(Number(c.req.query('limit') ?? 40), 100)
  const cursor = parseCursor(c.req.query('cursor'))

  const rows = await db
    .select({ user: schema.users, follow: schema.follows })
    .from(schema.follows)
    .innerJoin(schema.users, eq(schema.users.id, schema.follows.followerId))
    .where(
      and(
        eq(schema.follows.followeeId, user.id),
        isNull(schema.users.deletedAt),
        cursor ? lt(schema.follows.createdAt, cursor) : undefined,
      ),
    )
    .orderBy(desc(schema.follows.createdAt))
    .limit(limit)

  const users = rows.map((r) => publicUser(r.user, mediaEnv))
  const nextCursor = rows.length === limit ? rows[rows.length - 1]!.follow.createdAt.toISOString() : null
  return c.json({ users, nextCursor })
})

usersRoute.get('/:handle/following', async (c) => {
  const { db, mediaEnv } = c.get('ctx')
  const user = await resolveHandle(db, c.req.param('handle'))
  if (!user) return c.json({ error: 'not_found' }, 404)
  const limit = Math.min(Number(c.req.query('limit') ?? 40), 100)
  const cursor = parseCursor(c.req.query('cursor'))

  const rows = await db
    .select({ user: schema.users, follow: schema.follows })
    .from(schema.follows)
    .innerJoin(schema.users, eq(schema.users.id, schema.follows.followeeId))
    .where(
      and(
        eq(schema.follows.followerId, user.id),
        isNull(schema.users.deletedAt),
        cursor ? lt(schema.follows.createdAt, cursor) : undefined,
      ),
    )
    .orderBy(desc(schema.follows.createdAt))
    .limit(limit)

  const users = rows.map((r) => publicUser(r.user, mediaEnv))
  const nextCursor = rows.length === limit ? rows[rows.length - 1]!.follow.createdAt.toISOString() : null
  return c.json({ users, nextCursor })
})

// Follow / unfollow.
usersRoute.post('/:handle/follow', requireHandle(), async (c) => {
  const session = c.get('session')!
  const { db, cache, rateLimit } = c.get('ctx')
  await rateLimit(c, 'users.follow')
  const user = await resolveHandle(db, c.req.param('handle'))
  if (!user) return c.json({ error: 'not_found' }, 404)
  if (user.id === session.user.id) return c.json({ error: 'self_follow' }, 400)

  const notified = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(schema.follows)
      .values({ followerId: session.user.id, followeeId: user.id })
      .onConflictDoNothing()
      .returning({ followerId: schema.follows.followerId })
    if (inserted.length === 0) return new Set<string>()
    return notify(tx, [
      {
        userId: user.id,
        actorId: session.user.id,
        kind: 'follow',
      },
    ])
  })

  await Promise.all([
    cache.del(homeFeedCacheKey(session.user.id)),
    invalidateUnreadCounts(cache, notified),
  ])
  c.get('ctx').track('user_followed', session.user.id)
  return c.json({ ok: true })
})

usersRoute.delete('/:handle/follow', requireHandle(), async (c) => {
  const session = c.get('session')!
  const { db, cache } = c.get('ctx')
  const user = await resolveHandle(db, c.req.param('handle'))
  if (!user) return c.json({ error: 'not_found' }, 404)

  await db
    .delete(schema.follows)
    .where(and(eq(schema.follows.followerId, session.user.id), eq(schema.follows.followeeId, user.id)))

  await cache.del(homeFeedCacheKey(session.user.id))
  c.get('ctx').track('user_unfollowed', session.user.id)
  return c.json({ ok: true })
})

// Block / unblock (two-way hide). Also removes any follow edges in either direction.
usersRoute.post('/:handle/block', requireHandle(), async (c) => {
  const session = c.get('session')!
  const { db, cache, rateLimit } = c.get('ctx')
  await rateLimit(c, 'users.block')
  const user = await resolveHandle(db, c.req.param('handle'))
  if (!user) return c.json({ error: 'not_found' }, 404)
  if (user.id === session.user.id) return c.json({ error: 'self_block' }, 400)

  await db.transaction(async (tx) => {
    await tx
      .insert(schema.blocks)
      .values({ blockerId: session.user.id, blockedId: user.id })
      .onConflictDoNothing()
    await tx.delete(schema.follows).where(
      sql`(${schema.follows.followerId} = ${session.user.id} AND ${schema.follows.followeeId} = ${user.id})
          OR (${schema.follows.followerId} = ${user.id} AND ${schema.follows.followeeId} = ${session.user.id})`,
    )
  })

  // Both sides' feeds change — the blocker stops seeing the target, and the target stops
  // seeing the blocker. Drop both cached feeds.
  await cache.del(homeFeedCacheKey(session.user.id), homeFeedCacheKey(user.id))
  c.get('ctx').track('user_blocked', session.user.id)
  return c.json({ ok: true })
})

usersRoute.delete('/:handle/block', requireHandle(), async (c) => {
  const session = c.get('session')!
  const { db, cache } = c.get('ctx')
  const user = await resolveHandle(db, c.req.param('handle'))
  if (!user) return c.json({ error: 'not_found' }, 404)

  await db
    .delete(schema.blocks)
    .where(and(eq(schema.blocks.blockerId, session.user.id), eq(schema.blocks.blockedId, user.id)))

  await cache.del(homeFeedCacheKey(session.user.id), homeFeedCacheKey(user.id))
  c.get('ctx').track('user_unblocked', session.user.id)
  return c.json({ ok: true })
})

// Mute / unmute (one-way).
usersRoute.post('/:handle/mute', requireHandle(), async (c) => {
  const session = c.get('session')!
  const { db, cache, rateLimit } = c.get('ctx')
  await rateLimit(c, 'users.mute')
  const user = await resolveHandle(db, c.req.param('handle'))
  if (!user) return c.json({ error: 'not_found' }, 404)
  if (user.id === session.user.id) return c.json({ error: 'self_mute' }, 400)

  const body = await c.req.json().catch(() => ({}))
  const scope = ['feed', 'notifications', 'both'].includes(body?.scope) ? body.scope : 'feed'

  await db
    .insert(schema.mutes)
    .values({ muterId: session.user.id, mutedId: user.id, scope })
    .onConflictDoUpdate({
      target: [schema.mutes.muterId, schema.mutes.mutedId],
      set: { scope },
    })

  await cache.del(homeFeedCacheKey(session.user.id))
  c.get('ctx').track('user_muted', session.user.id)
  return c.json({ ok: true })
})

usersRoute.delete('/:handle/mute', requireHandle(), async (c) => {
  const session = c.get('session')!
  const { db, cache } = c.get('ctx')
  const user = await resolveHandle(db, c.req.param('handle'))
  if (!user) return c.json({ error: 'not_found' }, 404)

  await db
    .delete(schema.mutes)
    .where(and(eq(schema.mutes.muterId, session.user.id), eq(schema.mutes.mutedId, user.id)))

  await cache.del(homeFeedCacheKey(session.user.id))
  c.get('ctx').track('user_unmuted', session.user.id)
  return c.json({ ok: true })
})

function publicUser(
  u: typeof schema.users.$inferSelect,
  env: import('@workspace/media/env').MediaEnv,
) {
  return {
    id: u.id,
    handle: u.handle,
    displayName: u.displayName,
    bio: u.bio,
    avatarUrl: assetUrl(env, u.avatarUrl),
    bannerUrl: assetUrl(env, u.bannerUrl),
    isVerified: u.isVerified,
    isBot: u.isBot,
    role: u.role,
    createdAt: u.createdAt,
  }
}
