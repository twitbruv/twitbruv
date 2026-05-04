import { Hono } from 'hono'
import { z } from 'zod'
import { and, asc, desc, eq, exists, gte, ilike, inArray, isNull, lte, or, sql } from '@workspace/db'
import { schema } from '@workspace/db'
import { assetUrl } from '@workspace/media/s3'
import { handleSchema } from '@workspace/validators'
import { requireHandle, type HonoEnv } from '../middleware/session.ts'
import { toPostDto } from '../lib/post-dto.ts'
import { loadViewerFlags } from '../lib/viewer-flags.ts'
import { loadPostMedia } from '../lib/post-media.ts'
import { loadArticleCards } from '../lib/article-cards.ts'
import { loadRepostTargets } from '../lib/repost-targets.ts'
import { loadQuoteTargets } from '../lib/quote-targets.ts'
import { attachReplyParents } from '../lib/reply-parents.ts'
import { loadPolls } from '../lib/polls.ts'
import { loadUnfurlCards } from '../lib/unfurl-cards.ts'

export const searchRoute = new Hono<HonoEnv>()

// Hard cap on the raw search query string. Above this we'd bloat the FTS
// parse + force giant LIKE patterns through the planner without giving users
// meaningful additional precision.
const MAX_SEARCH_QUERY_LEN = 200

// Parsed, validated representation of a user query like
//   "vacation from:lucas has:media since:2026-01-01"
interface ParsedQuery {
  text: string
  fromHandle?: string
  toHandle?: string
  hasMedia?: boolean
  hasLink?: boolean
  hasPoll?: boolean
  lang?: string
  sinceIso?: string
  untilIso?: string
  minLikes?: number
  minReplies?: number
}

const langWord = /^[a-z]{2,3}(?:-[A-Za-z]{2,4})?$/
const isoDate = /^\d{4}-\d{2}-\d{2}$/

function parseQuery(raw: string): ParsedQuery {
  const out: ParsedQuery = { text: '' }
  const words = raw.split(/\s+/)
  const free: Array<string> = []
  for (const w of words) {
    if (!w) continue
    const m = /^([a-z_]+):(.+)$/i.exec(w)
    if (!m) {
      // Strip leading @ from bare words: handles are stored without @, so
      // "@alice" must search as "alice". Mirrors the @-strip already done
      // for from:/to: handle operators below.
      const stripped = w.startsWith('@') ? w.slice(1) : w
      if (stripped) free.push(stripped)
      continue
    }
    const key = m[1]!.toLowerCase()
    const val = m[2]!
    switch (key) {
      case 'from': {
        const v = val.replace(/^@/, '')
        const r = handleSchema.safeParse(v)
        if (r.success) out.fromHandle = r.data.toLowerCase()
        else free.push(w)
        break
      }
      case 'to':
      case 'mention':
      case 'mentions': {
        const v = val.replace(/^@/, '')
        const r = handleSchema.safeParse(v)
        if (r.success) out.toHandle = r.data.toLowerCase()
        else free.push(w)
        break
      }
      case 'has':
        if (val === 'media' || val === 'image' || val === 'images') out.hasMedia = true
        else if (val === 'link' || val === 'links') out.hasLink = true
        else if (val === 'poll') out.hasPoll = true
        else free.push(w)
        break
      case 'lang':
        if (langWord.test(val)) out.lang = val.toLowerCase()
        else free.push(w)
        break
      case 'since':
        if (isoDate.test(val)) out.sinceIso = val
        else free.push(w)
        break
      case 'until':
        if (isoDate.test(val)) out.untilIso = val
        else free.push(w)
        break
      case 'min_likes':
      case 'minlikes': {
        const n = Number(val)
        if (Number.isFinite(n) && n >= 0 && n <= 1_000_000) out.minLikes = Math.floor(n)
        else free.push(w)
        break
      }
      case 'min_replies':
      case 'minreplies': {
        const n = Number(val)
        if (Number.isFinite(n) && n >= 0 && n <= 1_000_000) out.minReplies = Math.floor(n)
        else free.push(w)
        break
      }
      default:
        free.push(w)
    }
  }
  out.text = free.join(' ').trim()
  return out
}

searchRoute.get('/', async (c) => {
  const { db, mediaEnv, rateLimit } = c.get('ctx')
  await rateLimit(c, 'reads.search')
  const viewerId = c.get('session')?.user.id
  const rawQ = (c.req.query('q') ?? '').trim()
  if (rawQ.length < 2) return c.json({ users: [], posts: [] })
  const truncated = rawQ.slice(0, MAX_SEARCH_QUERY_LEN)
  const parsed = parseQuery(truncated)
  const q = parsed.text
  // LIKE wildcards, underscore, backslash — escape so user-supplied %s and _s don't turn into
  // expensive table scans of the form `WHERE handle ilike '%%%%%%%%%%%'`.
  const qLike = q ? `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%` : null

  // Users only show up when the query has free-text and no operators that
  // tie it specifically to posts (e.g. has:media, since:, etc.). For pure-
  // operator queries like "from:lucas" we skip the users section entirely.
  const skipUsers =
    !qLike ||
    parsed.hasMedia !== undefined ||
    parsed.hasLink !== undefined ||
    parsed.hasPoll !== undefined ||
    parsed.sinceIso !== undefined ||
    parsed.untilIso !== undefined ||
    parsed.lang !== undefined ||
    parsed.minLikes !== undefined ||
    parsed.minReplies !== undefined ||
    parsed.fromHandle !== undefined ||
    parsed.toHandle !== undefined

  // Users: match handle or displayName case-insensitive. For FTS-quality handle match we'd
  // add a trigram GIN index (pg_trgm) — acceptable v1 without it, small user counts.
  const users = skipUsers
    ? []
    : await db
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
            qLike
              ? or(
                  ilike(schema.users.handle, qLike),
                  ilike(schema.users.displayName, qLike),
                )
              : undefined,
          ),
        )
        .limit(20)

  const usersDto = users.map((u) => ({
    ...u,
    avatarUrl: assetUrl(mediaEnv, u.avatarUrl),
    bannerUrl: assetUrl(mediaEnv, u.bannerUrl),
  }))

  // Resolve from:/to: handles to user ids up-front so the post WHERE clause
  // can use a simple equality. Unknown handles produce zero results, which is
  // the right answer (and avoids leaking that the handle doesn't exist via a
  // different code path).
  let fromUserId: string | null | undefined
  if (parsed.fromHandle) {
    const [u] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(
        and(eq(schema.users.handle, parsed.fromHandle), isNull(schema.users.deletedAt)),
      )
      .limit(1)
    fromUserId = u?.id ?? null
  }
  let toUserId: string | null | undefined
  if (parsed.toHandle) {
    const [u] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(
        and(eq(schema.users.handle, parsed.toHandle), isNull(schema.users.deletedAt)),
      )
      .limit(1)
    toUserId = u?.id ?? null
  }

  // If a from: or to: was specified but the handle didn't resolve, return no
  // posts at all instead of silently dropping the operator.
  const handleLookupFailed =
    (parsed.fromHandle !== undefined && !fromUserId) ||
    (parsed.toHandle !== undefined && !toUserId)

  // Posts: Postgres FTS over text column (no GIN index for v1; acceptable until post count grows).
  const postRows = handleLookupFailed
    ? []
    : await db
        .select({ post: schema.posts, author: schema.users })
        .from(schema.posts)
        .innerJoin(schema.users, eq(schema.users.id, schema.posts.authorId))
        .where(
          and(
            isNull(schema.posts.deletedAt),
            eq(schema.posts.visibility, 'public'),
            q
              ? sql`to_tsvector('simple', ${schema.posts.text}) @@ websearch_to_tsquery('simple', ${q})`
              : undefined,
            fromUserId ? eq(schema.posts.authorId, fromUserId) : undefined,
            toUserId
              ? exists(
                  db
                    .select({ x: sql<number>`1` })
                    .from(schema.mentions)
                    .where(
                      and(
                        eq(schema.mentions.postId, schema.posts.id),
                        eq(schema.mentions.mentionedUserId, toUserId),
                      ),
                    ),
                )
              : undefined,
            parsed.hasMedia
              ? exists(
                  db
                    .select({ x: sql<number>`1` })
                    .from(schema.postMedia)
                    .where(eq(schema.postMedia.postId, schema.posts.id)),
                )
              : undefined,
            parsed.hasPoll
              ? exists(
                  db
                    .select({ x: sql<number>`1` })
                    .from(schema.polls)
                    .where(eq(schema.polls.postId, schema.posts.id)),
                )
              : undefined,
            parsed.hasLink
              ? sql`${schema.posts.text} ~* '\\m(https?://|www\\.)'`
              : undefined,
            parsed.lang ? eq(schema.posts.lang, parsed.lang) : undefined,
            parsed.sinceIso ? gte(schema.posts.createdAt, new Date(parsed.sinceIso)) : undefined,
            parsed.untilIso ? lte(schema.posts.createdAt, new Date(parsed.untilIso)) : undefined,
            parsed.minLikes !== undefined
              ? sql`${schema.posts.likeCount} >= ${parsed.minLikes}`
              : undefined,
            parsed.minReplies !== undefined
              ? sql`${schema.posts.replyCount} >= ${parsed.minReplies}`
              : undefined,
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
  const unfurlCardsMap = await loadUnfurlCards(db, ids, articleMap)
  const posts = postRows.map((r) =>
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
  await attachReplyParents({ db, viewerId, env: mediaEnv, posts })
  return c.json({ users: usersDto, posts })
})

// Saved searches: per-user list of stashed query strings, surfaced as
// shortcuts in the search UI. Same query string format as /api/search.
const savedQuerySchema = z.string().trim().min(1).max(MAX_SEARCH_QUERY_LEN)

searchRoute.get('/saved', requireHandle(), async (c) => {
  const session = c.get('session')!
  const { db } = c.get('ctx')
  const rows = await db
    .select({
      id: schema.savedSearches.id,
      query: schema.savedSearches.query,
      createdAt: schema.savedSearches.createdAt,
    })
    .from(schema.savedSearches)
    .where(eq(schema.savedSearches.userId, session.user.id))
    .orderBy(asc(schema.savedSearches.createdAt))
  return c.json({
    items: rows.map((r) => ({
      id: r.id,
      query: r.query,
      createdAt: r.createdAt.toISOString(),
    })),
  })
})

searchRoute.post('/saved', requireHandle(), async (c) => {
  const session = c.get('session')!
  const { db } = c.get('ctx')
  const body = z.object({ query: savedQuerySchema }).parse(await c.req.json())
  // Don't store duplicates — if this exact query is already saved, return
  // the existing row instead of creating a second one.
  const [existing] = await db
    .select({ id: schema.savedSearches.id })
    .from(schema.savedSearches)
    .where(
      and(
        eq(schema.savedSearches.userId, session.user.id),
        eq(schema.savedSearches.query, body.query),
      ),
    )
    .limit(1)
  if (existing) {
    return c.json({ item: { id: existing.id, query: body.query } })
  }
  const [created] = await db
    .insert(schema.savedSearches)
    .values({ userId: session.user.id, query: body.query })
    .returning()
  if (!created) return c.json({ error: 'insert_failed' }, 500)
  c.get('ctx').track('search_saved', session.user.id)
  return c.json({
    item: {
      id: created.id,
      query: created.query,
      createdAt: created.createdAt.toISOString(),
    },
  })
})

searchRoute.delete('/saved/:id', requireHandle(), async (c) => {
  const session = c.get('session')!
  const { db } = c.get('ctx')
  const id = c.req.param('id')
  const result = await db
    .delete(schema.savedSearches)
    .where(
      and(
        eq(schema.savedSearches.id, id),
        eq(schema.savedSearches.userId, session.user.id),
      ),
    )
    .returning({ id: schema.savedSearches.id })
  if (result.length === 0) return c.json({ error: 'not_found' }, 404)
  c.get('ctx').track('search_saved_deleted', session.user.id)
  return c.json({ ok: true })
})
