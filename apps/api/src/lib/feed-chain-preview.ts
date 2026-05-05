import { and, eq, inArray, isNull } from "@workspace/db"
import type { Database } from "@workspace/db"
import { schema } from "@workspace/db"
import type { MediaEnv } from "@workspace/media/env"
import { toPostDto, type PostDto } from "./post-dto.ts"
import { loadViewerFlags } from "./viewer-flags.ts"
import { loadPostMedia } from "./post-media.ts"
import { loadArticleCards } from "./article-cards.ts"
import { loadRepostTargets } from "./repost-targets.ts"
import { loadQuoteTargets } from "./quote-targets.ts"
import { loadPolls } from "./polls.ts"
import { loadUnfurlCards } from "./unfurl-cards.ts"

/**
 * For reply rows in home/public feeds, attach chainPreview (conversation root + omitted count)
 * when depth >= 2 so the client can render root → "N more replies" → leaf with thread lines.
 * Root is omitted when it would not be visible to the viewer (followers-only without follow).
 */
export async function attachFeedChainPreviews(args: {
  db: Database
  viewerId: string | undefined
  env: MediaEnv
  posts: Array<PostDto>
}): Promise<void> {
  const { db, viewerId, env, posts } = args

  const targets: Array<{
    outer: PostDto
    displayed: PostDto
    rootId: string
    depth: number
  }> = []

  for (const p of posts) {
    const displayed = p.repostOf ?? p
    if (!displayed.replyToId || !displayed.rootId) continue
    if (displayed.conversationDepth < 2) continue
    targets.push({
      outer: p,
      displayed,
      rootId: displayed.rootId,
      depth: displayed.conversationDepth,
    })
  }

  if (targets.length === 0) return

  const rootIds = Array.from(new Set(targets.map((t) => t.rootId)))

  const rootRows = await db
    .select({ post: schema.posts, author: schema.users })
    .from(schema.posts)
    .innerJoin(schema.users, eq(schema.users.id, schema.posts.authorId))
    .where(
      and(inArray(schema.posts.id, rootIds), isNull(schema.posts.deletedAt))
    )

  const rootById = new Map(rootRows.map((r) => [r.post.id, r]))

  const visibleRootAuthorIds = new Set<string>()
  const followersOnlyAuthorIds = Array.from(
    new Set(
      rootIds
        .map((id) => rootById.get(id))
        .filter((r) => r?.post.visibility === "followers")
        .map((r) => r!.post.authorId)
    )
  )

  if (followersOnlyAuthorIds.length > 0 && viewerId) {
    const followRows = await db
      .select({ followeeId: schema.follows.followeeId })
      .from(schema.follows)
      .where(
        and(
          eq(schema.follows.followerId, viewerId),
          inArray(schema.follows.followeeId, followersOnlyAuthorIds)
        )
      )
    for (const fr of followRows) visibleRootAuthorIds.add(fr.followeeId)
  }

  const rootsToLoad: typeof rootRows = []
  for (const id of rootIds) {
    const row = rootById.get(id)
    if (!row) continue
    if (row.post.visibility === "followers") {
      const authorId = row.post.authorId
      if (viewerId === authorId || visibleRootAuthorIds.has(authorId)) {
        rootsToLoad.push(row)
      }
    } else {
      rootsToLoad.push(row)
    }
  }

  if (rootsToLoad.length === 0) return

  const loadIds = rootsToLoad.map((r) => r.post.id)
  const [flags, mediaMap, articleMap, repostMap, quoteMap, pollMap] =
    await Promise.all([
      loadViewerFlags(db, viewerId, loadIds),
      loadPostMedia(db, loadIds),
      loadArticleCards(db, loadIds),
      loadRepostTargets({
        db,
        viewerId,
        env,
        repostRows: rootsToLoad.map((r) => ({
          id: r.post.id,
          repostOfId: r.post.repostOfId,
        })),
      }),
      loadQuoteTargets({
        db,
        viewerId,
        env,
        quoteRows: rootsToLoad.map((r) => ({
          id: r.post.id,
          quoteOfId: r.post.quoteOfId,
        })),
      }),
      loadPolls(db, viewerId, loadIds),
    ])
  const unfurlCardsMap = await loadUnfurlCards(db, loadIds, articleMap)

  const rootDtoById = new Map<string, PostDto>()
  for (const r of rootsToLoad) {
    rootDtoById.set(
      r.post.id,
      toPostDto(
        r.post,
        r.author,
        flags.get(r.post.id),
        mediaMap.get(r.post.id),
        env,
        unfurlCardsMap.get(r.post.id),
        repostMap.get(r.post.id),
        quoteMap.get(r.post.id),
        pollMap.get(r.post.id)
      )
    )
  }

  for (const t of targets) {
    const rootDto = rootDtoById.get(t.rootId)
    if (!rootDto) continue
    const omitted = Math.max(0, t.depth - 1)
    ;(t.outer as PostDto).chainPreview = {
      root: rootDto,
      omittedCount: omitted,
    }
    delete t.displayed.replyParent
  }
}

export function linkSamePageReplies(posts: Array<PostDto>): void {
  const byId = new Map<string, PostDto>()
  for (const p of posts) byId.set(p.id, p)

  for (const p of posts) {
    if (p.chainPreview) continue
    if (!p.replyToId) continue
    const parent = byId.get(p.replyToId)
    if (parent) {
      p.chainPreview = { root: parent, omittedCount: 0 }
      delete p.replyParent
      continue
    }
    if (p.replyParent) {
      p.chainPreview = { root: p.replyParent, omittedCount: 0 }
      delete p.replyParent
    }
  }
}

export function filterRedundantChainPosts(
  posts: Array<PostDto>
): Array<PostDto> {
  const hasChildInFeed = new Set<string>()
  const shownAsChainRoot = new Set<string>()
  for (const p of posts) {
    if (p.replyToId) hasChildInFeed.add(p.replyToId)
    if (p.chainPreview) shownAsChainRoot.add(p.chainPreview.root.id)
  }
  return posts.filter((p) => {
    if (p.replyToId) return !hasChildInFeed.has(p.id)
    return !shownAsChainRoot.has(p.id)
  })
}

/**
 * Ranked-feed variant of link + dedup. Walks posts in ranker order so the first
 * reply to claim a root wins; later replies to the same root are dropped entirely.
 * This avoids showing the same root post twice and gives the ranker indirect control
 * over which reply surfaces (the one it ranked highest).
 *
 * Handles three reply tiers:
 *  1. depth >= 2 already processed by attachFeedChainPreviews (chainPreview set)
 *  2. depth-1 replies whose parent is on the same page (same-page linking)
 *  3. depth-1 replies whose parent is off-page (promote replyParent to chainPreview)
 *
 * After linking, standalone posts that became chain roots are removed.
 */
export function linkAndDeduplicateRanked(
  posts: Array<PostDto>
): Array<PostDto> {
  const byId = new Map<string, PostDto>()
  for (const p of posts) byId.set(p.id, p)

  const usedRoots = new Set<string>()
  const toRemove = new Set<string>()

  for (const p of posts) {
    if (p.chainPreview) {
      const rootId = p.chainPreview.root.id
      if (usedRoots.has(rootId)) {
        delete p.chainPreview
        toRemove.add(p.id)
      } else {
        usedRoots.add(rootId)
      }
      continue
    }

    if (!p.replyToId) continue

    const parent = byId.get(p.replyToId)
    if (parent) {
      if (usedRoots.has(parent.id)) {
        toRemove.add(p.id)
        continue
      }
      p.chainPreview = { root: parent, omittedCount: 0 }
      delete p.replyParent
      usedRoots.add(parent.id)
      continue
    }

    if (p.replyParent) {
      const parentId = p.replyParent.id
      if (usedRoots.has(parentId)) {
        toRemove.add(p.id)
        continue
      }
      p.chainPreview = { root: p.replyParent, omittedCount: 0 }
      delete p.replyParent
      usedRoots.add(parentId)
    }
  }

  return posts.filter((p) => {
    if (toRemove.has(p.id)) return false
    if (usedRoots.has(p.id) && !p.chainPreview) return false
    return true
  })
}
