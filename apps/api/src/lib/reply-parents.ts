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

/**
 * For reply posts, load the full chain of handles from the conversation root to the
 * immediate parent. This is used in notifications to show "Replying to @user1, @user2, ...".
 *
 * Mutates `posts` in place, setting `replyChainHandles` on each reply.
 */
export async function attachReplyChainHandles(args: {
  db: Database
  posts: Array<PostDto>
}): Promise<void> {
  const { db, posts } = args

  // Collect posts that are replies (have rootId indicating they're in a thread)
  const repliesWithRoot: Array<{ post: PostDto; rootId: string }> = []
  for (const p of posts) {
    const displayed = p.repostOf ?? p
    if (displayed.rootId && displayed.replyToId) {
      repliesWithRoot.push({ post: displayed, rootId: displayed.rootId })
    }
  }
  if (repliesWithRoot.length === 0) return

  // Group by rootId to batch load conversation posts
  const byRoot = new Map<string, PostDto[]>()
  for (const { post, rootId } of repliesWithRoot) {
    if (!byRoot.has(rootId)) byRoot.set(rootId, [])
    byRoot.get(rootId)!.push(post)
  }

  // For each conversation, load all posts from root to the reply and build chain handles
  for (const [rootId, postsInConvo] of byRoot) {
    // Load all posts in this conversation that could be ancestors
    // (posts with same rootId, or the root itself)
    const ancestorRows = await db
      .select({
        id: schema.posts.id,
        replyToId: schema.posts.replyToId,
        authorHandle: schema.users.handle,
      })
      .from(schema.posts)
      .innerJoin(schema.users, eq(schema.users.id, schema.posts.authorId))
      .where(
        and(
          isNull(schema.posts.deletedAt),
          // Posts that are either the root or have this rootId
          inArray(
            schema.posts.id,
            db
              .select({ id: schema.posts.id })
              .from(schema.posts)
              .where(
                and(
                  isNull(schema.posts.deletedAt),
                  // Either the root post itself or posts in this conversation
                  eq(schema.posts.rootId, rootId),
                ),
              ),
          ),
        ),
      )

    // Also load the root post itself (which has rootId = null)
    const rootRows = await db
      .select({
        id: schema.posts.id,
        replyToId: schema.posts.replyToId,
        authorHandle: schema.users.handle,
      })
      .from(schema.posts)
      .innerJoin(schema.users, eq(schema.users.id, schema.posts.authorId))
      .where(and(eq(schema.posts.id, rootId), isNull(schema.posts.deletedAt)))

    // Build a map of postId -> { replyToId, authorHandle }
    const postMap = new Map<string, { replyToId: string | null; authorHandle: string | null }>()
    for (const row of [...ancestorRows, ...rootRows]) {
      postMap.set(row.id, { replyToId: row.replyToId, authorHandle: row.authorHandle })
    }

    // For each reply post, walk up the chain and collect handles
    for (const post of postsInConvo) {
      const handles: string[] = []
      const seen = new Set<string>()
      let currentId: string | null = post.replyToId

      // Walk up to 10 levels to prevent infinite loops
      let depth = 0
      while (currentId && depth < 10) {
        const ancestor = postMap.get(currentId)
        if (!ancestor) break

        if (ancestor.authorHandle && !seen.has(ancestor.authorHandle)) {
          seen.add(ancestor.authorHandle)
          handles.push(ancestor.authorHandle)
        }

        currentId = ancestor.replyToId
        depth++
      }

      // Reverse so handles are in order from root to immediate parent
      post.replyChainHandles = handles.reverse()
    }
  }
}
