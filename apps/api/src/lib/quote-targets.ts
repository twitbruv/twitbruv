import { and, eq, inArray, isNull } from '@workspace/db'
import type { Database } from '@workspace/db'
import { schema } from '@workspace/db'
import type { MediaEnv } from '@workspace/media/env'
import { toPostDto, type PostDto } from './post-dto.ts'
import { loadViewerFlags } from './viewer-flags.ts'
import { loadPostMedia } from './post-media.ts'
import { loadArticleCards } from './article-cards.ts'
import { loadUnfurlCards } from './unfurl-cards.ts'

/**
 * For posts that have `quoteOfId` set, load the original post they quote and shape it as a
 * PostDto (with media + viewer flags + article card). Returned map is keyed by the QUOTING
 * post's id, not the target's. We intentionally do NOT recurse into the quoted post's own
 * repostOf/quoteOf — one level of embed is enough for the feed.
 */
export async function loadQuoteTargets(args: {
  db: Database
  viewerId: string | undefined
  env: MediaEnv
  quoteRows: Array<{ id: string; quoteOfId: string | null }>
}): Promise<Map<string, PostDto>> {
  const { db, viewerId, env, quoteRows } = args
  const map = new Map<string, PostDto>()

  const rows = quoteRows.filter((r) => r.quoteOfId !== null) as Array<{
    id: string
    quoteOfId: string
  }>
  if (rows.length === 0) return map
  const targetIds = Array.from(new Set(rows.map((r) => r.quoteOfId)))

  const joined = await db
    .select({ post: schema.posts, author: schema.users })
    .from(schema.posts)
    .innerJoin(schema.users, eq(schema.users.id, schema.posts.authorId))
    .where(and(inArray(schema.posts.id, targetIds), isNull(schema.posts.deletedAt)))

  const [flags, mediaMap, articleMap] = await Promise.all([
    loadViewerFlags(db, viewerId, targetIds),
    loadPostMedia(db, targetIds),
    loadArticleCards(db, targetIds),
  ])

  const unfurlCardsMap = await loadUnfurlCards(db, targetIds, articleMap)

  const dtoById = new Map<string, PostDto>()
  for (const r of joined) {
    dtoById.set(
      r.post.id,
      toPostDto(
        r.post,
        r.author,
        flags.get(r.post.id),
        mediaMap.get(r.post.id),
        env,
        unfurlCardsMap.get(r.post.id),
      ),
    )
  }

  for (const r of rows) {
    const dto = dtoById.get(r.quoteOfId)
    if (dto) map.set(r.id, dto)
  }
  return map
}
