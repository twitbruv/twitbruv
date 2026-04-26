import { Hono } from 'hono'
import { and, desc, eq, isNull, lt } from '@workspace/db'
import { schema } from '@workspace/db'
import { createArticleSchema, updateArticleSchema } from '@workspace/validators'
import { handleRateLimitError } from '@workspace/rate-limit'
import { assetUrl } from '@workspace/media/s3'
import type { MediaEnv } from '@workspace/media/env'
import { requireAuth, type HonoEnv } from '../middleware/session.ts'
import { slugify, uniqueSlugForAuthor } from '../lib/slug.ts'

export const articlesRoute = new Hono<HonoEnv>()

const WORDS_PER_MINUTE = 220

function readingMinutes(text: string) {
  const words = text.trim().split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE))
}

function wordCount(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length
}

function toArticleDto(
  a: typeof schema.articles.$inferSelect,
  author: typeof schema.users.$inferSelect,
  env: MediaEnv,
  coverMedia?: typeof schema.media.$inferSelect | null,
) {
  const variants = Array.isArray(coverMedia?.variants)
    ? (coverMedia.variants as Array<{ kind: string; key: string; width: number; height: number }>)
    : []
  const pickKey =
    variants.find((v) => v.kind === 'large')?.key ??
    variants.find((v) => v.kind === 'medium')?.key ??
    null
  return {
    id: a.id,
    slug: a.slug,
    title: a.title,
    subtitle: a.subtitle,
    bodyFormat: a.bodyFormat,
    bodyJson: a.bodyJson,
    bodyText: a.bodyText,
    wordCount: a.wordCount,
    readingMinutes: a.readingMinutes,
    status: a.status,
    publishedAt: a.publishedAt?.toISOString() ?? null,
    editedAt: a.editedAt?.toISOString() ?? null,
    createdAt: null as string | null,
    likeCount: a.likeCount,
    bookmarkCount: a.bookmarkCount,
    replyCount: a.replyCount,
    crosspostPostId: a.crosspostPostId,
    coverMediaId: a.coverMediaId,
    coverUrl: pickKey ? assetUrl(env, pickKey) : null,
    author: {
      id: author.id,
      handle: author.handle,
      displayName: author.displayName,
      avatarUrl: assetUrl(env, author.avatarUrl),
      isVerified: author.isVerified,
      role: author.role,
    },
  }
}

async function loadCover(
  db: import('@workspace/db').Database,
  coverMediaId: string | null,
): Promise<typeof schema.media.$inferSelect | null> {
  if (!coverMediaId) return null
  const [row] = await db.select().from(schema.media).where(eq(schema.media.id, coverMediaId)).limit(1)
  return row ?? null
}

articlesRoute.post('/', requireAuth(), async (c) => {
  const session = c.get('session')!
  const { db, rateLimit } = c.get('ctx')
  await rateLimit(c, 'articles.write')
  const body = createArticleSchema.parse(await c.req.json())

  const baseSlug = body.slug ? slugify(body.slug) : slugify(body.title)
  const slug = await uniqueSlugForAuthor(db, session.user.id, baseSlug)

  const result = await db.transaction(async (tx) => {
    const publishedAt = body.status === 'published' ? new Date() : null
    const [article] = await tx
      .insert(schema.articles)
      .values({
        authorId: session.user.id,
        slug,
        title: body.title,
        subtitle: body.subtitle ?? null,
        coverMediaId: body.coverMediaId ?? null,
        bodyFormat: body.bodyFormat,
        bodyJson: body.bodyJson ?? null,
        bodyText: body.bodyText,
        wordCount: wordCount(body.bodyText),
        readingMinutes: readingMinutes(body.bodyText),
        status: body.status,
        publishedAt,
      })
      .returning()
    if (!article) throw new Error('insert_failed')

    // Auto-crosspost when publishing outright.
    let crosspostPostId: string | null = null
    if (body.status === 'published') {
      const [author] = await tx.select().from(schema.users).where(eq(schema.users.id, session.user.id)).limit(1)
      if (author?.handle) {
        const articleUrl = `/${author.handle}/a/${article.slug}`
        const [post] = await tx
          .insert(schema.posts)
          .values({
            authorId: session.user.id,
            text: `new article: "${article.title}" — ${articleUrl}`,
          })
          .returning()
        crosspostPostId = post?.id ?? null
        if (post) {
          await tx
            .update(schema.articles)
            .set({ crosspostPostId: post.id })
            .where(eq(schema.articles.id, article.id))
        }
      }
    }

    const [author] = await tx.select().from(schema.users).where(eq(schema.users.id, article.authorId)).limit(1)
    return { article: { ...article, crosspostPostId }, author: author! }
  })

  c.get('ctx').track('article_created', session.user.id)
  return c.json(
    {
      article: toArticleDto(
        result.article,
        result.author,
        c.get('ctx').mediaEnv,
        await loadCover(c.get('ctx').db, result.article.coverMediaId),
      ),
    },
    201,
  )
})

articlesRoute.patch('/:id', requireAuth(), async (c) => {
  const session = c.get('session')!
  const { db, rateLimit } = c.get('ctx')
  await rateLimit(c, 'articles.write')
  const id = c.req.param('id')
  const body = updateArticleSchema.parse(await c.req.json())

  const result = await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(schema.articles).where(eq(schema.articles.id, id)).limit(1)
    if (!existing || existing.deletedAt) throw new HttpError(404, 'not_found')
    if (existing.authorId !== session.user.id) throw new HttpError(403, 'forbidden')

    // Slug changes: regenerate uniqueness. Avoid silently changing slug if user just re-submits.
    let nextSlug = existing.slug
    if (body.slug && body.slug !== existing.slug) {
      nextSlug = await uniqueSlugForAuthor(tx as any, session.user.id, slugify(body.slug), existing.id)
    }

    const willPublish = body.status === 'published' && existing.status !== 'published'
    const publishedAt = willPublish ? new Date() : existing.publishedAt

    const nextBodyText = body.bodyText ?? existing.bodyText ?? ''

    const [article] = await tx
      .update(schema.articles)
      .set({
        title: body.title ?? existing.title,
        subtitle: body.subtitle ?? existing.subtitle,
        slug: nextSlug,
        coverMediaId:
          body.coverMediaId !== undefined ? body.coverMediaId : existing.coverMediaId,
        bodyFormat: body.bodyFormat ?? existing.bodyFormat,
        bodyJson: body.bodyJson ?? existing.bodyJson,
        bodyText: nextBodyText,
        wordCount: wordCount(nextBodyText),
        readingMinutes: readingMinutes(nextBodyText),
        status: body.status ?? existing.status,
        publishedAt,
        editedAt: new Date(),
      })
      .where(eq(schema.articles.id, existing.id))
      .returning()
    if (!article) throw new HttpError(500, 'update_failed')

    if (willPublish && !article.crosspostPostId) {
      const [author] = await tx.select().from(schema.users).where(eq(schema.users.id, session.user.id)).limit(1)
      if (author?.handle) {
        const articleUrl = `/${author.handle}/a/${article.slug}`
        const [post] = await tx
          .insert(schema.posts)
          .values({
            authorId: session.user.id,
            text: `new article: "${article.title}" — ${articleUrl}`,
          })
          .returning()
        if (post) {
          await tx
            .update(schema.articles)
            .set({ crosspostPostId: post.id })
            .where(eq(schema.articles.id, article.id))
          article.crosspostPostId = post.id
        }
      }
    }

    const [author] = await tx.select().from(schema.users).where(eq(schema.users.id, article.authorId)).limit(1)
    return { article, author: author! }
  })

  c.get('ctx').track('article_updated', session.user.id)
  return c.json({
    article: toArticleDto(
      result.article,
      result.author,
      c.get('ctx').mediaEnv,
      await loadCover(c.get('ctx').db, result.article.coverMediaId),
    ),
  })
})

articlesRoute.delete('/:id', requireAuth(), async (c) => {
  const session = c.get('session')!
  const { db } = c.get('ctx')
  const id = c.req.param('id')
  await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(schema.articles).where(eq(schema.articles.id, id)).limit(1)
    if (!existing || existing.deletedAt) throw new HttpError(404, 'not_found')
    if (existing.authorId !== session.user.id) throw new HttpError(403, 'forbidden')
    await tx.update(schema.articles).set({ deletedAt: new Date() }).where(eq(schema.articles.id, id))
    if (existing.crosspostPostId) {
      await tx
        .update(schema.posts)
        .set({ deletedAt: new Date() })
        .where(eq(schema.posts.id, existing.crosspostPostId))
    }
  })
  c.get('ctx').track('article_deleted', session.user.id)
  return c.json({ ok: true })
})

// Author-only: full article by id (includes drafts).
articlesRoute.get('/:id', requireAuth(), async (c) => {
  const session = c.get('session')!
  const { db } = c.get('ctx')
  const id = c.req.param('id')
  const rows = await db
    .select({ article: schema.articles, author: schema.users })
    .from(schema.articles)
    .innerJoin(schema.users, eq(schema.users.id, schema.articles.authorId))
    .where(and(eq(schema.articles.id, id), isNull(schema.articles.deletedAt)))
    .limit(1)
  const row = rows[0]
  if (!row) return c.json({ error: 'not_found' }, 404)
  if (row.article.status === 'draft' && row.article.authorId !== session.user.id) {
    return c.json({ error: 'not_found' }, 404)
  }
  return c.json({
    article: toArticleDto(
      row.article,
      row.author,
      c.get('ctx').mediaEnv,
      await loadCover(c.get('ctx').db, row.article.coverMediaId),
    ),
  })
})

class HttpError extends Error {
  constructor(public status: number, public code: string) {
    super(code)
  }
}

articlesRoute.onError((err, c) => {
  const rl = handleRateLimitError(err, c)
  if (rl) return rl
  if (err instanceof HttpError) return c.json({ error: err.code }, err.status as never)
  console.error(err)
  return c.json({ error: 'internal_error', message: err.message }, 500)
})

// Also surface a viewer-focused "my articles" list for the editor dashboard.
articlesRoute.get('/', requireAuth(), async (c) => {
  const session = c.get('session')!
  const { db } = c.get('ctx')
  const limit = Math.min(Number(c.req.query('limit') ?? 40), 100)
  const cursor = c.req.query('cursor')
  const rows = await db
    .select()
    .from(schema.articles)
    .where(
      and(
        eq(schema.articles.authorId, session.user.id),
        isNull(schema.articles.deletedAt),
        cursor ? lt(schema.articles.id, cursor) : undefined,
      ),
    )
    .orderBy(desc(schema.articles.id))
    .limit(limit)
  return c.json({
    articles: rows.map((a) => ({
      id: a.id,
      slug: a.slug,
      title: a.title,
      subtitle: a.subtitle,
      status: a.status,
      publishedAt: a.publishedAt?.toISOString() ?? null,
      wordCount: a.wordCount,
      readingMinutes: a.readingMinutes,
    })),
    nextCursor: rows.length === limit ? rows[rows.length - 1]!.id : null,
  })
})
