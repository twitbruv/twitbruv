import { Hono } from 'hono'
import { and, desc, eq, ilike, isNull, or, sql } from '@workspace/db'
import { schema } from '@workspace/db'
import { assetUrl } from '@workspace/media/s3'
import type { HonoEnv } from '../middleware/session.ts'
import { toPostDto } from '../lib/post-dto.ts'
import { loadViewerFlags } from '../lib/viewer-flags.ts'
import { loadPostMedia } from '../lib/post-media.ts'
import { loadArticleCards } from '../lib/article-cards.ts'
import { loadRepostTargets } from '../lib/repost-targets.ts'
import { loadQuoteTargets } from '../lib/quote-targets.ts'
import { loadPolls } from '../lib/polls.ts'

export const searchRoute = new Hono<HonoEnv>()

// Hard cap on the search query string. Above this we'd bloat the FTS parse + force giant
// LIKE patterns through the planner without giving users meaningful additional precision.
const MAX_SEARCH_QUERY_LEN = 80

searchRoute.get('/', async (c) => {
  const { db, mediaEnv, rateLimit } = c.get('ctx')
  await rateLimit(c, 'reads.search')
  const viewerId = c.get('session')?.user.id
  const rawQ = (c.req.query('q') ?? '').trim()
  if (rawQ.length < 2) return c.json({ users: [], posts: [] })
  const q = rawQ.slice(0, MAX_SEARCH_QUERY_LEN)
  // LIKE wildcards, underscore, backslash — escape so user-supplied %s and _s don't turn into
  // expensive table scans of the form `WHERE handle ilike '%%%%%%%%%%%'`.
  const qLike = `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`

  // Users: match handle or displayName case-insensitive. For FTS-quality handle match we'd
  // add a trigram GIN index (pg_trgm) — acceptable v1 without it, small user counts.
  const users = await db
    .select({
      id: schema.users.id,
      handle: schema.users.handle,
      displayName: schema.users.displayName,
      bio: schema.users.bio,
      avatarUrl: schema.users.avatarUrl,
      bannerUrl: schema.users.bannerUrl,
      isVerified: schema.users.isVerified,
      isBot: schema.users.isBot,
      createdAt: schema.users.createdAt,
    })
    .from(schema.users)
    .where(
      and(
        isNull(schema.users.deletedAt),
        or(ilike(schema.users.handle, qLike), ilike(schema.users.displayName, qLike)),
      ),
    )
    .limit(20)

  const usersDto = users.map((u) => ({
    ...u,
    avatarUrl: assetUrl(mediaEnv, u.avatarUrl),
    bannerUrl: assetUrl(mediaEnv, u.bannerUrl),
  }))

  // Posts: Postgres FTS over text column (no GIN index for v1; acceptable until post count grows).
  const postRows = await db
    .select({ post: schema.posts, author: schema.users })
    .from(schema.posts)
    .innerJoin(schema.users, eq(schema.users.id, schema.posts.authorId))
    .where(
      and(
        isNull(schema.posts.deletedAt),
        eq(schema.posts.visibility, 'public'),
        sql`to_tsvector('simple', ${schema.posts.text}) @@ websearch_to_tsquery('simple', ${q})`,
      ),
    )
    .orderBy(desc(schema.posts.createdAt))
    .limit(40)

  const ids = postRows.map((r) => r.post.id)
  const [flags, mediaMap, articleMap, repostMap, quoteMap, pollMap] = await Promise.all([
    loadViewerFlags(db, viewerId, ids),
    loadPostMedia(db, ids),
    loadArticleCards(db, ids),
    loadRepostTargets({
      db,
      viewerId,
      env: mediaEnv,
      repostRows: postRows.map((r) => ({ id: r.post.id, repostOfId: r.post.repostOfId })),
    }),
    loadQuoteTargets({
      db,
      viewerId,
      env: mediaEnv,
      quoteRows: postRows.map((r) => ({ id: r.post.id, quoteOfId: r.post.quoteOfId })),
    }),
    loadPolls(db, viewerId, ids),
  ])
  const posts = postRows.map((r) =>
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
  return c.json({ users: usersDto, posts })
})
