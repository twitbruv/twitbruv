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
 * For a list of posts that may be replies, batch-load the parent post each one is replying to
 * and attach it as `replyParent` on the displayed post (the inner `repostOf` for reposts, the
 * row itself otherwise). Without this, replies surface in feeds with no conversation context.
 *
 * Mutates `posts` in place. We intentionally do NOT recurse: the parent is rendered as a small
 * embed and doesn't itself carry a `replyParent`.
 */
export async function attachReplyParents(args: {
  db: Database
  viewerId: string | undefined
  env: MediaEnv
  posts: Array<PostDto>
}): Promise<void> {
  const { db, viewerId, env, posts } = args
  const targets: Array<{ outer: PostDto; replyToId: string }> = []
  for (const p of posts) {
    const displayed = p.repostOf ?? p
    if (displayed.replyToId) targets.push({ outer: p, replyToId: displayed.replyToId })
  }
  if (targets.length === 0) return

  const parentIds = Array.from(new Set(targets.map((t) => t.replyToId)))

  const joined = await db
    .select({ post: schema.posts, author: schema.users })
    .from(schema.posts)
    .innerJoin(schema.users, eq(schema.users.id, schema.posts.authorId))
    .where(and(inArray(schema.posts.id, parentIds), isNull(schema.posts.deletedAt)))

  const [flags, mediaMap, articleMap] = await Promise.all([
    loadViewerFlags(db, viewerId, parentIds),
    loadPostMedia(db, parentIds),
    loadArticleCards(db, parentIds),
  ])
  const unfurlCardsMap = await loadUnfurlCards(db, parentIds, articleMap)

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

  for (const t of targets) {
    const parent = dtoById.get(t.replyToId)
    if (!parent) continue
    const displayed = t.outer.repostOf ?? t.outer
    displayed.replyParent = parent
  }
}
