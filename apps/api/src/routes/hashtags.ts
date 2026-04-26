import { Hono } from 'hono'
import { and, desc, eq, isNull, lt, sql } from '@workspace/db'
import { schema } from '@workspace/db'
import type { HonoEnv } from '../middleware/session.ts'
import { toPostDto } from '../lib/post-dto.ts'
import { loadViewerFlags } from '../lib/viewer-flags.ts'
import { loadPostMedia } from '../lib/post-media.ts'
import { loadArticleCards } from '../lib/article-cards.ts'
import { loadRepostTargets } from '../lib/repost-targets.ts'
import { loadQuoteTargets } from '../lib/quote-targets.ts'
import { loadPolls } from '../lib/polls.ts'
import { loadGithubCards } from '../lib/github-cards.ts'
import { parseCursor } from '../lib/cursor.ts'

export const hashtagsRoute = new Hono<HonoEnv>()

const TRENDING_CACHE_KEY = 'trending:hashtags:24h'
const TRENDING_TTL_SECONDS = 60 * 30

interface TrendingHashtag {
  tag: string
  postCount: number
}

// Top hashtags from the last 24 hours, by distinct post count. Reads from a Redis cache that
// the worker (or any caller) refreshes; computes inline on miss.
hashtagsRoute.get('/trending', async (c) => {
  const { db, cache } = c.get('ctx')
  const cached = await cache.get<Array<TrendingHashtag>>(TRENDING_CACHE_KEY)
  if (cached) return c.json({ hashtags: cached, cached: true })

  const fresh = await computeTrending(db)
  await cache.set(TRENDING_CACHE_KEY, fresh, TRENDING_TTL_SECONDS)
  return c.json({ hashtags: fresh, cached: false })
})

async function computeTrending(
  db: import('@workspace/db').Database,
): Promise<Array<TrendingHashtag>> {
  const result = await db.execute(sql`
    SELECT h.tag, COUNT(DISTINCT ph.post_id)::int AS n
    FROM ${schema.postHashtags} ph
    JOIN ${schema.hashtags} h ON h.id = ph.hashtag_id
    JOIN ${schema.posts} p ON p.id = ph.post_id
    WHERE p.created_at > now() - interval '24 hours'
      AND p.deleted_at IS NULL
      AND p.visibility = 'public'
    GROUP BY h.tag
    ORDER BY n DESC
    LIMIT 10
  `)
  return (result as unknown as Array<{ tag: string; n: number }>).map((r) => ({
    tag: r.tag,
    postCount: r.n,
  }))
}

hashtagsRoute.get('/:tag/posts', async (c) => {
  const { db, mediaEnv } = c.get('ctx')
  const viewerId = c.get('session')?.user.id
  const tag = c.req.param('tag').toLowerCase().replace(/^#/, '')
  const limit = Math.min(Number(c.req.query('limit') ?? 40), 100)
  const cursor = parseCursor(c.req.query('cursor'))

  const [hashtag] = await db
    .select()
    .from(schema.hashtags)
    .where(eq(schema.hashtags.tag, tag))
    .limit(1)
  if (!hashtag) return c.json({ posts: [], nextCursor: null, tag })

  const rows = await db
    .select({ post: schema.posts, author: schema.users })
    .from(schema.postHashtags)
    .innerJoin(schema.posts, eq(schema.posts.id, schema.postHashtags.postId))
    .innerJoin(schema.users, eq(schema.users.id, schema.posts.authorId))
    .where(
      and(
        eq(schema.postHashtags.hashtagId, hashtag.id),
        isNull(schema.posts.deletedAt),
        eq(schema.posts.visibility, 'public'),
        cursor ? lt(schema.posts.createdAt, cursor) : undefined,
      ),
    )
    .orderBy(desc(schema.posts.createdAt))
    .limit(limit)

  const ids = rows.map((r) => r.post.id)
  const [flags, mediaMap, articleMap, repostMap, quoteMap, pollMap, githubMap] = await Promise.all([
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
    loadGithubCards(db, ids),
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
      githubMap.get(r.post.id),
    ),
  )
  const nextCursor = posts.length === limit ? posts[posts.length - 1]!.createdAt : null
  return c.json({ tag, posts, nextCursor })
})
