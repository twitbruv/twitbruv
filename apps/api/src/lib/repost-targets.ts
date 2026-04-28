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
 * For a set of repost row ids, load the *original* posts each one points at and shape them as
 * PostDtos (with media, viewer flags, article cards — the things the UI needs to render the
 * actual tweet). Returns a map keyed by the REPOST row's id, not the original's id.
 */
export async function loadRepostTargets(args: {
  db: Database
  viewerId: string | undefined
  env: MediaEnv
  repostRows: Array<{ id: string; repostOfId: string | null }>
}): Promise<Map<string, PostDto>> {
  const { db, viewerId, env, repostRows } = args
  const map = new Map<string, PostDto>()

  const rows = repostRows.filter((r) => r.repostOfId !== null) as Array<{
    id: string
    repostOfId: string
  }>
  if (rows.length === 0) return map
  const targetIds = Array.from(new Set(rows.map((r) => r.repostOfId)))

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
    const dto = dtoById.get(r.repostOfId)
    if (dto) map.set(r.id, dto)
  }
  return map
}
