import {
  and,
  eq,
  inArray,
  schema,
  excludeViewerSocialFilters,
  isVisibleFeedPost,
  type Database,
} from '@workspace/db'
import type { MediaEnv } from '@workspace/media/env'
import { toPostDto, type PostDto } from './post-dto.ts'
import { loadViewerFlags } from './viewer-flags.ts'
import { loadPostMedia } from './post-media.ts'
import { loadArticleCards } from './article-cards.ts'
import { loadRepostTargets } from './repost-targets.ts'
import { loadQuoteTargets } from './quote-targets.ts'
import { attachReplyParents } from './reply-parents.ts'
import { loadPolls } from './polls.ts'
import { loadUnfurlCards } from './unfurl-cards.ts'

export interface HydratePostsByIdsArgs {
  db: Database
  viewerId: string
  mediaEnv: MediaEnv
  postIds: ReadonlyArray<string>
}

/**
 * Hydrate an ordered list of post IDs into PostDto objects, preserving the input order.
 *
 * Two reasons this lives separately from the existing per-route hydration:
 *
 * 1. The For You ranker returns IDs only — the API has to load posts/authors itself.
 * 2. The existing routes hydrate rows already pulled with their own `WHERE`. They can't be
 *    reused here because we need the order returned by the ranker, not `ORDER BY createdAt`.
 *
 * SAFETY: this function applies a final safety filter on the API side (deletedAt + viewer
 * blocks/feed-mutes) using the shared feed-policy helpers. Even if the ranker filtered the
 * same things, anything could have changed between ranker pre-filtering and this hydration
 * (a user might have just blocked an author), and the API is the last thing the client sees,
 * so we re-check rather than trusting the upstream result.
 */
export async function hydratePostsByIds(
  args: HydratePostsByIdsArgs,
): Promise<PostDto[]> {
  const { db, viewerId, mediaEnv, postIds } = args
  if (postIds.length === 0) return []

  const rows = await db
    .select({ post: schema.posts, author: schema.users })
    .from(schema.posts)
    .innerJoin(schema.users, eq(schema.users.id, schema.posts.authorId))
    .where(
      and(
        inArray(schema.posts.id, [...postIds]),
        isVisibleFeedPost(),
        excludeViewerSocialFilters(viewerId),
      ),
    )
  if (rows.length === 0) return []

  const ids = rows.map((r) => r.post.id)
  const [flags, mediaMap, articleMap, repostMap, quoteMap, pollMap] = await Promise.all([
    loadViewerFlags(db, viewerId, ids),
    loadPostMedia(db, ids),
    loadArticleCards(db, ids),
    loadRepostTargets({
      db,
      viewerId,
      env: mediaEnv,
      repostRows: rows.map((r) => ({
        id: r.post.id,
        repostOfId: r.post.repostOfId,
      })),
    }),
    loadQuoteTargets({
      db,
      viewerId,
      env: mediaEnv,
      quoteRows: rows.map((r) => ({
        id: r.post.id,
        quoteOfId: r.post.quoteOfId,
      })),
    }),
    loadPolls(db, viewerId, ids),
  ])
  const unfurlCardsMap = await loadUnfurlCards(db, ids, articleMap)

  const dtoById = new Map<string, PostDto>()
  for (const r of rows) {
    dtoById.set(
      r.post.id,
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
  }

  const ordered: PostDto[] = []
  for (const id of postIds) {
    const dto = dtoById.get(id)
    if (dto) ordered.push(dto)
  }

  await attachReplyParents({ db, viewerId, env: mediaEnv, posts: ordered })
  return ordered
}
