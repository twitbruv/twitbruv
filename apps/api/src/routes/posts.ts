import { Hono } from 'hono'
import { and, asc, desc, eq, inArray, isNull, lt, sql } from '@workspace/db'
import { schema } from '@workspace/db'
import { publicUrl } from '@workspace/media/s3'
import {
  createPostSchema,
  editPostSchema,
  paginationSchema,
} from '@workspace/validators'
import { handleRateLimitError } from '@workspace/rate-limit'
import { requireHandle, type HonoEnv } from '../middleware/session.ts'
import { toPostDto } from '../lib/post-dto.ts'
import { loadViewerFlags } from '../lib/viewer-flags.ts'
import { loadPostMedia } from '../lib/post-media.ts'
import { loadArticleCards } from '../lib/article-cards.ts'
import { loadRepostTargets } from '../lib/repost-targets.ts'
import { loadQuoteTargets } from '../lib/quote-targets.ts'
import { attachFeedChainPreviews, linkSamePageReplies, filterRedundantChainPosts } from '../lib/feed-chain-preview.ts'
import { attachReplyParents } from '../lib/reply-parents.ts'
import { loadPolls } from '../lib/polls.ts'
import { linkHashtags } from '../lib/hashtags.ts'
import { linkMentions } from '../lib/mentions.ts'
import { notify, invalidateUnreadCounts } from '../lib/notify.ts'
import { parseCursor } from '../lib/cursor.ts'
import { homeFeedCacheKey, profileFeedCacheKey } from './feed.ts'
import { attachPostUnfurls, runInlineUnfurls } from '../lib/post-unfurls.ts'
import { loadUnfurlCards } from '../lib/unfurl-cards.ts'

export const postsRoute = new Hono<HonoEnv>()

const EDIT_WINDOW_MS = 5 * 60 * 1000

// Create a post (top-level, reply, or quote).
postsRoute.post('/', requireHandle(), async (c) => {
  const session = c.get('session')!
  const { db, cache, rateLimit, moderate, log, mediaEnv } = c.get('ctx')
  const body = createPostSchema.parse(await c.req.json())
  await rateLimit(c, body.replyToId ? 'posts.reply' : 'posts.create')

  let imageUrls: string[] = []
  if (body.mediaIds && body.mediaIds.length > 0) {
    const rows = await db
      .select({ kind: schema.media.kind, originalKey: schema.media.originalKey })
      .from(schema.media)
      .where(
        and(
          inArray(schema.media.id, body.mediaIds),
          eq(schema.media.ownerId, session.user.id),
        ),
      )
    imageUrls = rows
      .filter((r) => r.kind === 'image' || r.kind === 'gif')
      .map((r) => publicUrl(mediaEnv, r.originalKey))
  }

  const verdict = await moderate(body.text, imageUrls)
  if (verdict.verdict === 'block') {
    log.info(
      { userId: session.user.id, categories: verdict.categories, hadImages: imageUrls.length > 0 },
      'post_blocked_by_moderation',
    )
    return c.json({ error: 'moderation_blocked', message: verdict.message }, 422)
  }

  if (body.replyToId && body.quoteOfId) {
    return c.json({ error: 'invalid_combo', message: 'reply and quote are mutually exclusive' }, 400)
  }

  const result = await db.transaction(async (tx) => {
    let replyToId: string | null = null
    let rootId: string | null = null
    let depth = 0
    let replyTargetAuthorId: string | null = null
    let quoteTargetAuthorId: string | null = null

    if (body.replyToId) {
      const [parent] = await tx
        .select()
        .from(schema.posts)
        .where(and(eq(schema.posts.id, body.replyToId), isNull(schema.posts.deletedAt)))
        .limit(1)
      if (!parent) throw new HttpError(404, 'reply_target_not_found')

      replyToId = parent.id
      rootId = parent.rootId ?? parent.id
      depth = parent.conversationDepth + 1
      replyTargetAuthorId = parent.authorId

      // Enforce the conversation root's reply restriction. The author of the
      // root and the post author can always reply (X behavior). For
      // "following" we require the root's author to follow the replier;
      // for "mentioned" we require the replier to be mentioned in the root.
      const rootPostId = parent.rootId ?? parent.id
      const [root] =
        rootPostId === parent.id
          ? [parent]
          : await tx
              .select()
              .from(schema.posts)
              .where(eq(schema.posts.id, rootPostId))
              .limit(1)
      if (root && root.authorId !== session.user.id) {
        if (root.replyRestriction === 'following') {
          const [followRow] = await tx
            .select({ x: sql<number>`1` })
            .from(schema.follows)
            .where(
              and(
                eq(schema.follows.followerId, root.authorId),
                eq(schema.follows.followeeId, session.user.id),
              ),
            )
            .limit(1)
          if (!followRow) throw new HttpError(403, 'replies_limited_to_following')
        } else if (root.replyRestriction === 'mentioned') {
          const [mentionRow] = await tx
            .select({ x: sql<number>`1` })
            .from(schema.mentions)
            .where(
              and(
                eq(schema.mentions.postId, root.id),
                eq(schema.mentions.mentionedUserId, session.user.id),
              ),
            )
            .limit(1)
          if (!mentionRow) throw new HttpError(403, 'replies_limited_to_mentioned')
        }
      }

      await tx
        .update(schema.posts)
        .set({ replyCount: sql`${schema.posts.replyCount} + 1` })
        .where(eq(schema.posts.id, parent.id))
    }

    let quoteOfId: string | null = null
    if (body.quoteOfId) {
      const [target] = await tx
        .select({ id: schema.posts.id, authorId: schema.posts.authorId })
        .from(schema.posts)
        .where(and(eq(schema.posts.id, body.quoteOfId), isNull(schema.posts.deletedAt)))
        .limit(1)
      if (!target) throw new HttpError(404, 'quote_target_not_found')
      quoteOfId = target.id
      quoteTargetAuthorId = target.authorId
      await tx
        .update(schema.posts)
        .set({ quoteCount: sql`${schema.posts.quoteCount} + 1` })
        .where(eq(schema.posts.id, target.id))
    }

    const [post] = await tx
      .insert(schema.posts)
      .values({
        authorId: session.user.id,
        text: body.text,
        lang: body.lang,
        replyToId,
        rootId,
        quoteOfId,
        conversationDepth: depth,
        visibility: body.visibility,
        replyRestriction: body.replyRestriction,
        sensitive: body.sensitive,
        contentWarning: body.contentWarning,
      })
      .returning()
    if (!post) throw new HttpError(500, 'insert_failed')

    if (body.mediaIds && body.mediaIds.length > 0) {
      const ownedMedia = await tx
        .select({ id: schema.media.id })
        .from(schema.media)
        .where(
          and(
            inArray(schema.media.id, body.mediaIds),
            eq(schema.media.ownerId, session.user.id),
          ),
        )
      const ownedSet = new Set(ownedMedia.map((m) => m.id))
      const invalid = body.mediaIds.filter((id) => !ownedSet.has(id))
      if (invalid.length > 0) throw new HttpError(400, 'invalid_media_ids')

      await tx.insert(schema.postMedia).values(
        body.mediaIds.map((mediaId, position) => ({
          postId: post.id,
          mediaId,
          position,
        })),
      )
    }

    if (body.poll) {
      const closesAt = new Date(Date.now() + body.poll.durationMinutes * 60_000)
      const [pollRow] = await tx
        .insert(schema.polls)
        .values({
          postId: post.id,
          closesAt,
          allowMultiple: body.poll.allowMultiple,
        })
        .returning({ id: schema.polls.id })
      if (!pollRow) throw new HttpError(500, 'poll_insert_failed')
      await tx.insert(schema.pollOptions).values(
        body.poll.options.map((text, position) => ({
          pollId: pollRow.id,
          position,
          text: text.trim(),
        })),
      )
    }

    await linkHashtags(tx, post.id, post.text)
    const mentionedUserIds = await linkMentions(tx, post.id, session.user.id, post.text)
    const { toEnqueue: unfurlJobs } = await attachPostUnfurls({
      tx: tx as never,
      postId: post.id,
      text: post.text,
    })

    // Fan-out notifications. Self-notifications and duplicates (mention of the reply target,
    // for instance) are filtered inside notify() + de-duped here to avoid double rows.
    const notifiedForStructure = new Set<string>()
    const toNotify: Array<Parameters<typeof notify>[1][number]> = []
    if (replyTargetAuthorId && replyTargetAuthorId !== session.user.id) {
      toNotify.push({
        userId: replyTargetAuthorId,
        actorId: session.user.id,
        kind: 'reply',
        entityType: 'post',
        entityId: post.id,
      })
      notifiedForStructure.add(replyTargetAuthorId)
    }
    if (quoteTargetAuthorId && quoteTargetAuthorId !== session.user.id) {
      toNotify.push({
        userId: quoteTargetAuthorId,
        actorId: session.user.id,
        kind: 'quote',
        entityType: 'post',
        entityId: post.id,
      })
      notifiedForStructure.add(quoteTargetAuthorId)
    }
    for (const uid of mentionedUserIds) {
      if (notifiedForStructure.has(uid)) continue
      toNotify.push({
        userId: uid,
        actorId: session.user.id,
        kind: 'mention',
        entityType: 'post',
        entityId: post.id,
      })
    }
    const notified = await notify(tx, toNotify)

    const [author] = await tx.select().from(schema.users).where(eq(schema.users.id, post.authorId)).limit(1)
    if (!author) throw new HttpError(500, 'author_missing')

    return { post, author, notified, unfurlJobs }
  })

  // Invalidate the author's cached home feed so their own new post shows up on refresh,
  // their profile-feed page-0 cache (this post needs to be at top), and any unread-count
  // caches for users who got a notification. Fetch GitHub cards inline so they're in the
  // create response — runInlineUnfurls falls back to the worker on per-ref timeout. Done
  // after the tx commits so a rollback can't leave behind half-fetched rows.
  await Promise.all([
    cache.del(homeFeedCacheKey(session.user.id), profileFeedCacheKey(session.user.id)),
    invalidateUnreadCounts(cache, result.notified),
    runInlineUnfurls(db, c.get('ctx').boss, result.unfurlJobs, {
      youtubeApiKey: c.get('ctx').env.YOUTUBE_API_KEY,
      fxtwitterApiBaseUrl: c.get('ctx').env.FXTWITTER_API_BASE_URL,
    }),
  ])

  const env = c.get('ctx').mediaEnv
  const [mediaMap, articleMap, repostMap, quoteMap, pollMap] = await Promise.all([
    loadPostMedia(db, [result.post.id]),
    loadArticleCards(db, [result.post.id]),
    loadRepostTargets({
      db,
      viewerId: session.user.id,
      env,
      repostRows: [{ id: result.post.id, repostOfId: result.post.repostOfId }],
    }),
    loadQuoteTargets({
      db,
      viewerId: session.user.id,
      env,
      quoteRows: [{ id: result.post.id, quoteOfId: result.post.quoteOfId }],
    }),
    loadPolls(db, session.user.id, [result.post.id]),
  ])
  const unfurlCardsMap = await loadUnfurlCards(db, [result.post.id], articleMap)
  const dto = toPostDto(
    result.post,
    result.author,
    { liked: false, bookmarked: false, reposted: false },
    mediaMap.get(result.post.id),
    env,
    unfurlCardsMap.get(result.post.id),
    repostMap.get(result.post.id),
    quoteMap.get(result.post.id),
    pollMap.get(result.post.id),
  )
  await attachReplyParents({ db, viewerId: session.user.id, env, posts: [dto] })
  c.get('ctx').track('post_created', session.user.id, {
    has_media: !!body.mediaIds?.length,
    has_poll: !!body.poll,
    is_reply: !!body.replyToId,
    is_quote: !!body.quoteOfId,
  })
  return c.json({ post: dto }, 201)
})

// Repost (creates a posts row with repostOfId set, empty text).
postsRoute.post('/:id/repost', requireHandle(), async (c) => {
  const session = c.get('session')!
  const { db, cache, rateLimit } = c.get('ctx')
  const id = c.req.param('id')
  await rateLimit(c, 'posts.repost')

  const result = await db.transaction(async (tx) => {
    const [target] = await tx
      .select()
      .from(schema.posts)
      .where(and(eq(schema.posts.id, id), isNull(schema.posts.deletedAt)))
      .limit(1)
    if (!target) throw new HttpError(404, 'not_found')

    const [existing] = await tx
      .select({ id: schema.posts.id })
      .from(schema.posts)
      .where(
        and(
          eq(schema.posts.authorId, session.user.id),
          eq(schema.posts.repostOfId, target.id),
          isNull(schema.posts.deletedAt),
        ),
      )
      .limit(1)
    if (existing) return { notified: new Set<string>() }

    await tx.insert(schema.posts).values({
      authorId: session.user.id,
      text: '',
      repostOfId: target.id,
    })

    await tx
      .update(schema.posts)
      .set({ repostCount: sql`${schema.posts.repostCount} + 1` })
      .where(eq(schema.posts.id, target.id))

    const notified = await notify(tx, [
      {
        userId: target.authorId,
        actorId: session.user.id,
        kind: 'repost',
        entityType: 'post',
        entityId: target.id,
      },
    ])
    return { notified }
  })

  await Promise.all([
    cache.del(homeFeedCacheKey(session.user.id), profileFeedCacheKey(session.user.id)),
    invalidateUnreadCounts(cache, result.notified),
  ])
  c.get('ctx').track('post_reposted', session.user.id)
  return c.json({ ok: true })
})

postsRoute.delete('/:id/repost', requireHandle(), async (c) => {
  const session = c.get('session')!
  const { db } = c.get('ctx')
  const id = c.req.param('id')

  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(schema.posts)
      .where(
        and(
          eq(schema.posts.authorId, session.user.id),
          eq(schema.posts.repostOfId, id),
          isNull(schema.posts.deletedAt),
        ),
      )
      .limit(1)
    if (!existing) return
    await tx.update(schema.posts).set({ deletedAt: new Date() }).where(eq(schema.posts.id, existing.id))
    await tx
      .update(schema.posts)
      .set({ repostCount: sql`GREATEST(${schema.posts.repostCount} - 1, 0)` })
      .where(eq(schema.posts.id, id))
  })

  c.get('ctx').track('post_unreposted', session.user.id)
  return c.json({ ok: true })
})

// Like / unlike.
postsRoute.post('/:id/like', requireHandle(), async (c) => {
  const session = c.get('session')!
  const { db, rateLimit } = c.get('ctx')
  const id = c.req.param('id')
  await rateLimit(c, 'posts.like')

  const notified = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(schema.likes)
      .values({ userId: session.user.id, postId: id })
      .onConflictDoNothing()
      .returning({ postId: schema.likes.postId })
    if (inserted.length === 0) return new Set<string>()

    await tx
      .update(schema.posts)
      .set({ likeCount: sql`${schema.posts.likeCount} + 1` })
      .where(eq(schema.posts.id, id))

    const [target] = await tx
      .select({ authorId: schema.posts.authorId })
      .from(schema.posts)
      .where(eq(schema.posts.id, id))
      .limit(1)
    if (!target) return new Set<string>()
    await tx
      .delete(schema.notifications)
      .where(
        and(
          eq(schema.notifications.userId, target.authorId),
          eq(schema.notifications.actorId, session.user.id),
          eq(schema.notifications.kind, 'like'),
          eq(schema.notifications.entityType, 'post'),
          eq(schema.notifications.entityId, id),
        ),
      )
    return notify(tx, [
      {
        userId: target.authorId,
        actorId: session.user.id,
        kind: 'like',
        entityType: 'post',
        entityId: id,
      },
    ])
  })

  await invalidateUnreadCounts(c.get('ctx').cache, notified)
  c.get('ctx').track('post_liked', session.user.id)
  return c.json({ ok: true })
})

postsRoute.delete('/:id/like', requireHandle(), async (c) => {
  const session = c.get('session')!
  const { db } = c.get('ctx')
  const id = c.req.param('id')

  await db.transaction(async (tx) => {
    const deleted = await tx
      .delete(schema.likes)
      .where(and(eq(schema.likes.userId, session.user.id), eq(schema.likes.postId, id)))
      .returning({ postId: schema.likes.postId })
    if (deleted.length > 0) {
      await tx
        .update(schema.posts)
        .set({ likeCount: sql`GREATEST(${schema.posts.likeCount} - 1, 0)` })
        .where(eq(schema.posts.id, id))
    }
  })

  c.get('ctx').track('post_unliked', session.user.id)
  return c.json({ ok: true })
})

// Bookmark / unbookmark.
postsRoute.post('/:id/bookmark', requireHandle(), async (c) => {
  const session = c.get('session')!
  const { db, rateLimit } = c.get('ctx')
  const id = c.req.param('id')
  await rateLimit(c, 'posts.bookmark')

  await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(schema.bookmarks)
      .values({ userId: session.user.id, postId: id })
      .onConflictDoNothing()
      .returning({ postId: schema.bookmarks.postId })
    if (inserted.length > 0) {
      await tx
        .update(schema.posts)
        .set({ bookmarkCount: sql`${schema.posts.bookmarkCount} + 1` })
        .where(eq(schema.posts.id, id))
    }
  })

  c.get('ctx').track('post_bookmarked', session.user.id)
  return c.json({ ok: true })
})

postsRoute.delete('/:id/bookmark', requireHandle(), async (c) => {
  const session = c.get('session')!
  const { db } = c.get('ctx')
  const id = c.req.param('id')

  await db.transaction(async (tx) => {
    const deleted = await tx
      .delete(schema.bookmarks)
      .where(and(eq(schema.bookmarks.userId, session.user.id), eq(schema.bookmarks.postId, id)))
      .returning({ postId: schema.bookmarks.postId })
    if (deleted.length > 0) {
      await tx
        .update(schema.posts)
        .set({ bookmarkCount: sql`GREATEST(${schema.posts.bookmarkCount} - 1, 0)` })
        .where(eq(schema.posts.id, id))
    }
  })

  c.get('ctx').track('post_unbookmarked', session.user.id)
  return c.json({ ok: true })
})

// Thread: ancestors + target + immediate replies.
const THREAD_MAX_ANCESTORS = 30

postsRoute.get('/:id/thread', async (c) => {
  const { db, rateLimit } = c.get('ctx')
  await rateLimit(c, 'reads.thread')
  const viewerId = c.get('session')?.user.id
  const id = c.req.param('id')

  const [target] = await db
    .select()
    .from(schema.posts)
    .where(and(eq(schema.posts.id, id), isNull(schema.posts.deletedAt)))
    .limit(1)
  if (!target) return c.json({ error: 'not_found' }, 404)

  // Walk ancestors via a single recursive CTE instead of N sequential round-trips. Bounded
  // depth keeps the planner honest for pathological reply chains. The `depth` column orders
  // results child-first; we reverse to render root-first.
  type AncestorIdRow = { id: string; depth: number }
  const ancestorRows: Array<AncestorIdRow> = target.replyToId
    ? ((
        await db.execute(sql<{ id: string; depth: number }>`
          WITH RECURSIVE ancestors(id, reply_to_id, depth) AS (
            SELECT id, reply_to_id, 0
              FROM posts
              WHERE id = ${target.replyToId} AND deleted_at IS NULL
            UNION ALL
            SELECT p.id, p.reply_to_id, a.depth + 1
              FROM posts p
              INNER JOIN ancestors a ON p.id = a.reply_to_id
              WHERE p.deleted_at IS NULL AND a.depth < ${THREAD_MAX_ANCESTORS - 1}
          )
          SELECT id, depth FROM ancestors ORDER BY depth DESC
        `)
      ) as unknown as Array<AncestorIdRow>)
    : []
  const ancestorIds = ancestorRows.map((r) => r.id)

  const ancestorPostRows = ancestorIds.length
    ? await db
        .select({ post: schema.posts, author: schema.users })
        .from(schema.posts)
        .innerJoin(schema.users, eq(schema.users.id, schema.posts.authorId))
        .where(and(inArray(schema.posts.id, ancestorIds), isNull(schema.posts.deletedAt)))
    : []

  const [targetWithAuthor] = await db
    .select({ post: schema.posts, author: schema.users })
    .from(schema.posts)
    .innerJoin(schema.users, eq(schema.users.id, schema.posts.authorId))
    .where(eq(schema.posts.id, target.id))
    .limit(1)

  const replies = await db
    .select({ post: schema.posts, author: schema.users })
    .from(schema.posts)
    .innerJoin(schema.users, eq(schema.users.id, schema.posts.authorId))
    .where(and(eq(schema.posts.replyToId, target.id), isNull(schema.posts.deletedAt)))
    .orderBy(asc(schema.posts.createdAt))
    .limit(100)

  // For each immediate reply, count how many further replies it has (one hop, non-deleted).
  // This lets the UI render a "View N more replies" affordance without doing the recursive
  // walk for every reply ahead of time.
  const replyIds = replies.map((r) => r.post.id)
  const descendantCounts = new Map<string, number>()
  if (replyIds.length > 0) {
    const rows = await db
      .select({
        id: schema.posts.replyToId,
        n: sql<number>`count(*)::int`,
      })
      .from(schema.posts)
      .where(
        and(
          inArray(schema.posts.replyToId, replyIds),
          isNull(schema.posts.deletedAt),
        ),
      )
      .groupBy(schema.posts.replyToId)
    for (const r of rows) if (r.id) descendantCounts.set(r.id, r.n)
  }

  const allIds = [...ancestorPostRows.map((r) => r.post.id), target.id, ...replies.map((r) => r.post.id)]
  const env = c.get('ctx').mediaEnv
  const allRepostRows = [
    ...ancestorPostRows.map((r) => ({ id: r.post.id, repostOfId: r.post.repostOfId })),
    { id: target.id, repostOfId: target.repostOfId },
    ...replies.map((r) => ({ id: r.post.id, repostOfId: r.post.repostOfId })),
  ]
  const allQuoteRows = [
    ...ancestorPostRows.map((r) => ({ id: r.post.id, quoteOfId: r.post.quoteOfId })),
    { id: target.id, quoteOfId: target.quoteOfId },
    ...replies.map((r) => ({ id: r.post.id, quoteOfId: r.post.quoteOfId })),
  ]
  const [flags, mediaMap, articleMap, repostMap, quoteMap, pollMap] = await Promise.all([
    loadViewerFlags(db, viewerId, allIds),
    loadPostMedia(db, allIds),
    loadArticleCards(db, allIds),
    loadRepostTargets({ db, viewerId, env, repostRows: allRepostRows }),
    loadQuoteTargets({ db, viewerId, env, quoteRows: allQuoteRows }),
    loadPolls(db, viewerId, allIds),
  ])
  const unfurlCardsMap = await loadUnfurlCards(db, allIds, articleMap)

  const byId = new Map(ancestorPostRows.map((r) => [r.post.id, r]))
  const orderedAncestors = ancestorIds.map((i) => byId.get(i)!).filter(Boolean)

  return c.json({
    ancestors: orderedAncestors.map((r) =>
      toPostDto(
        r.post,
        r.author,
        flags.get(r.post.id),
        mediaMap.get(r.post.id),
        env,
        unfurlCardsMap.get(r.post.id),
        repostMap.get(r.post.id),
        quoteMap.get(r.post.id),
        pollMap.get(r.post.id),
      ),
    ),
    post: targetWithAuthor
      ? toPostDto(
          targetWithAuthor.post,
          targetWithAuthor.author,
          flags.get(target.id),
          mediaMap.get(target.id),
          env,
          unfurlCardsMap.get(target.id),
          repostMap.get(target.id),
          quoteMap.get(target.id),
          pollMap.get(target.id),
        )
      : null,
    replies: replies.map((r) => ({
      ...toPostDto(
        r.post,
        r.author,
        flags.get(r.post.id),
        mediaMap.get(r.post.id),
        env,
        unfurlCardsMap.get(r.post.id),
        repostMap.get(r.post.id),
        quoteMap.get(r.post.id),
        pollMap.get(r.post.id),
      ),
      descendantReplyCount: descendantCounts.get(r.post.id) ?? 0,
    })),
  })
})

// Fetch a single post.
postsRoute.get('/:id', async (c) => {
  const { db, mediaEnv, rateLimit } = c.get('ctx')
  await rateLimit(c, 'reads.thread')
  const viewerId = c.get('session')?.user.id
  const id = c.req.param('id')
  const rows = await db
    .select({ post: schema.posts, author: schema.users })
    .from(schema.posts)
    .innerJoin(schema.users, eq(schema.users.id, schema.posts.authorId))
    .where(and(eq(schema.posts.id, id), isNull(schema.posts.deletedAt)))
    .limit(1)
  const row = rows[0]
  if (!row) return c.json({ error: 'not_found' }, 404)
  const [flags, mediaMap, articleMap, repostMap, quoteMap, pollMap] = await Promise.all([
    loadViewerFlags(db, viewerId, [row.post.id]),
    loadPostMedia(db, [row.post.id]),
    loadArticleCards(db, [row.post.id]),
    loadRepostTargets({
      db,
      viewerId,
      env: mediaEnv,
      repostRows: [{ id: row.post.id, repostOfId: row.post.repostOfId }],
    }),
    loadQuoteTargets({
      db,
      viewerId,
      env: mediaEnv,
      quoteRows: [{ id: row.post.id, quoteOfId: row.post.quoteOfId }],
    }),
    loadPolls(db, viewerId, [row.post.id]),
  ])
  const unfurlCardsMap = await loadUnfurlCards(db, [row.post.id], articleMap)
  return c.json({
    post: toPostDto(
      row.post,
      row.author,
      flags.get(row.post.id),
      mediaMap.get(row.post.id),
      mediaEnv,
      unfurlCardsMap.get(row.post.id),
      repostMap.get(row.post.id),
      quoteMap.get(row.post.id),
      pollMap.get(row.post.id),
    ),
  })
})

// Edit (within 5 min of creation).
postsRoute.patch('/:id', requireHandle(), async (c) => {
  const session = c.get('session')!
  const { db, rateLimit } = c.get('ctx')
  await rateLimit(c, 'posts.edit')
  const id = c.req.param('id')
  const body = editPostSchema.parse(await c.req.json())

  const result = await db.transaction(async (tx) => {
    const [post] = await tx.select().from(schema.posts).where(eq(schema.posts.id, id)).limit(1)
    if (!post || post.deletedAt) throw new HttpError(404, 'not_found')
    if (post.authorId !== session.user.id) throw new HttpError(403, 'forbidden')
    const ageMs = Date.now() - post.createdAt.getTime()
    if (ageMs > EDIT_WINDOW_MS) throw new HttpError(409, 'edit_window_expired')
    if (post.text === body.text) return { post, unchanged: true as const }

    await tx.insert(schema.postEdits).values({
      postId: post.id,
      previousText: post.text,
      editedBy: session.user.id,
    })

    const [updated] = await tx
      .update(schema.posts)
      .set({ text: body.text, editedAt: new Date() })
      .where(eq(schema.posts.id, post.id))
      .returning()
    const { toEnqueue: unfurlJobs } = await attachPostUnfurls({
      tx: tx as never,
      postId: post.id,
      text: body.text,
      resetExistingLinks: true,
    })
    return { post: updated!, unchanged: false as const, unfurlJobs }
  })

  if (!result.unchanged) {
    await runInlineUnfurls(db, c.get('ctx').boss, result.unfurlJobs, {
      youtubeApiKey: c.get('ctx').env.YOUTUBE_API_KEY,
      fxtwitterApiBaseUrl: c.get('ctx').env.FXTWITTER_API_BASE_URL,
    })
  }

  const [author] = await db.select().from(schema.users).where(eq(schema.users.id, result.post.authorId)).limit(1)
  const env = c.get('ctx').mediaEnv
  const [flags, mediaMap, articleMap, repostMap, quoteMap, pollMap] = await Promise.all([
    loadViewerFlags(db, session.user.id, [result.post.id]),
    loadPostMedia(db, [result.post.id]),
    loadArticleCards(db, [result.post.id]),
    loadRepostTargets({
      db,
      viewerId: session.user.id,
      env,
      repostRows: [{ id: result.post.id, repostOfId: result.post.repostOfId }],
    }),
    loadQuoteTargets({
      db,
      viewerId: session.user.id,
      env,
      quoteRows: [{ id: result.post.id, quoteOfId: result.post.quoteOfId }],
    }),
    loadPolls(db, session.user.id, [result.post.id]),
  ])
  const unfurlCardsMap = await loadUnfurlCards(db, [result.post.id], articleMap)
  c.get('ctx').track('post_edited', session.user.id)
  return c.json({
    post: toPostDto(
      result.post,
      author!,
      flags.get(result.post.id),
      mediaMap.get(result.post.id),
      env,
      unfurlCardsMap.get(result.post.id),
      repostMap.get(result.post.id),
      quoteMap.get(result.post.id),
      pollMap.get(result.post.id),
    ),
  })
})

// Soft delete (author only). Decrements parent counters.
// Pin a post to the author's profile. Atomic clear-then-set in a tx so only one pinned post
// per author exists at a time. Reposts/replies/quotes can't be pinned — only originals.
postsRoute.post('/:id/pin', requireHandle(), async (c) => {
  const session = c.get('session')!
  const { db, rateLimit } = c.get('ctx')
  await rateLimit(c, 'posts.pin')
  const id = c.req.param('id')
  const me = session.user.id

  const [post] = await db.select().from(schema.posts).where(eq(schema.posts.id, id)).limit(1)
  if (!post || post.deletedAt) return c.json({ error: 'not_found' }, 404)
  if (post.authorId !== me) return c.json({ error: 'forbidden' }, 403)
  if (post.replyToId || post.repostOfId || post.quoteOfId) {
    return c.json({ error: 'pin_originals_only' }, 400)
  }

  await db.transaction(async (tx) => {
    await tx
      .update(schema.posts)
      .set({ pinnedAt: null })
      .where(and(eq(schema.posts.authorId, me), sql`${schema.posts.pinnedAt} IS NOT NULL`))
    await tx
      .update(schema.posts)
      .set({ pinnedAt: new Date() })
      .where(eq(schema.posts.id, id))
  })
  c.get('ctx').track('post_pinned', session.user.id)
  return c.json({ ok: true })
})

postsRoute.delete('/:id/pin', requireHandle(), async (c) => {
  const session = c.get('session')!
  const { db, rateLimit } = c.get('ctx')
  await rateLimit(c, 'posts.pin')
  const id = c.req.param('id')
  await db
    .update(schema.posts)
    .set({ pinnedAt: null })
    .where(and(eq(schema.posts.id, id), eq(schema.posts.authorId, session.user.id)))
  c.get('ctx').track('post_unpinned', session.user.id)
  return c.json({ ok: true })
})

// Read the prior versions of a post — newest first. We expose this to anyone
// who can already see the post (i.e. it isn't deleted) so the "edited" badge
// can link to a "View edit history" sheet, mirroring X's UX.
postsRoute.get('/:id/edits', async (c) => {
  const { db } = c.get('ctx')
  const id = c.req.param('id')
  const [post] = await db
    .select({ id: schema.posts.id, deletedAt: schema.posts.deletedAt })
    .from(schema.posts)
    .where(eq(schema.posts.id, id))
    .limit(1)
  if (!post || post.deletedAt) return c.json({ error: 'not_found' }, 404)
  const edits = await db
    .select({
      id: schema.postEdits.id,
      previousText: schema.postEdits.previousText,
      editedAt: schema.postEdits.editedAt,
    })
    .from(schema.postEdits)
    .where(eq(schema.postEdits.postId, id))
    .orderBy(desc(schema.postEdits.editedAt))
    .limit(50)
  return c.json({
    edits: edits.map((e) => ({
      id: e.id,
      previousText: e.previousText,
      editedAt: e.editedAt.toISOString(),
    })),
  })
})

postsRoute.delete('/:id', requireHandle(), async (c) => {
  const session = c.get('session')!
  const { db, cache } = c.get('ctx')
  const id = c.req.param('id')

  await db.transaction(async (tx) => {
    const [post] = await tx.select().from(schema.posts).where(eq(schema.posts.id, id)).limit(1)
    if (!post || post.deletedAt) throw new HttpError(404, 'not_found')
    if (post.authorId !== session.user.id) throw new HttpError(403, 'forbidden')

    await tx.update(schema.posts).set({ deletedAt: new Date() }).where(eq(schema.posts.id, post.id))

    if (post.replyToId) {
      await tx
        .update(schema.posts)
        .set({ replyCount: sql`GREATEST(${schema.posts.replyCount} - 1, 0)` })
        .where(eq(schema.posts.id, post.replyToId))
    }
    if (post.quoteOfId) {
      await tx
        .update(schema.posts)
        .set({ quoteCount: sql`GREATEST(${schema.posts.quoteCount} - 1, 0)` })
        .where(eq(schema.posts.id, post.quoteOfId))
    }
    if (post.repostOfId) {
      await tx
        .update(schema.posts)
        .set({ repostCount: sql`GREATEST(${schema.posts.repostCount} - 1, 0)` })
        .where(eq(schema.posts.id, post.repostOfId))
    }
  })

  await cache.del(homeFeedCacheKey(session.user.id))
  c.get('ctx').track('post_deleted', session.user.id)
  return c.json({ ok: true })
})

// Global public timeline.
postsRoute.get('/', async (c) => {
  const { db, mediaEnv, rateLimit } = c.get('ctx')
  await rateLimit(c, 'reads.feed')
  const viewerId = c.get('session')?.user.id
  const { limit, cursor: cursorRaw } = paginationSchema.parse({
    limit: c.req.query('limit'),
    cursor: c.req.query('cursor'),
  })
  const cursor = parseCursor(cursorRaw)

  const rows = await db
    .select({ post: schema.posts, author: schema.users })
    .from(schema.posts)
    .innerJoin(schema.users, eq(schema.users.id, schema.posts.authorId))
    .where(
      and(
        isNull(schema.posts.deletedAt),
        eq(schema.posts.visibility, 'public'),
        cursor ? lt(schema.posts.createdAt, cursor) : undefined,
      ),
    )
    .orderBy(desc(schema.posts.createdAt))
    .limit(limit)

  const ids = rows.map((r) => r.post.id)
  const [flags, mediaMap, articleMap, repostMap, quoteMap, pollMap] = await Promise.all([
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
  ])
  const unfurlCardsMap = await loadUnfurlCards(db, ids, articleMap)
  const posts = rows.map((r) =>
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
  await attachFeedChainPreviews({ db, viewerId, env: mediaEnv, posts })
  linkSamePageReplies(posts)
  const filtered = filterRedundantChainPosts(posts)
  const hasMore = limit > 0 && rows.length === limit
  const nextCursor = hasMore
    ? (rows.at(-1)?.post.createdAt.toISOString() ?? null)
    : null
  return c.json({ posts: filtered, nextCursor })
})

// Hide a reply from the conversation view. Allowed for the author of the
// conversation root and for site moderators. The reply is not deleted; the
// reply's author still sees it on their own profile and direct links still
// resolve, but the thread route collapses it behind a "Show hidden replies"
// affordance — same UX as X.
postsRoute.post('/:id/hide', requireHandle(), async (c) => {
  const session = c.get('session')!
  const { db } = c.get('ctx')
  const id = c.req.param('id')
  const [post] = await db
    .select()
    .from(schema.posts)
    .where(and(eq(schema.posts.id, id), isNull(schema.posts.deletedAt)))
    .limit(1)
  if (!post) return c.json({ error: 'not_found' }, 404)
  if (!post.replyToId) return c.json({ error: 'cannot_hide_root' }, 400)
  const rootId = post.rootId ?? post.replyToId
  const [root] = await db
    .select({ authorId: schema.posts.authorId })
    .from(schema.posts)
    .where(eq(schema.posts.id, rootId))
    .limit(1)
  if (!root) return c.json({ error: 'not_found' }, 404)
  const me = session.user.id
  const [meRow] = await db
    .select({ role: schema.users.role })
    .from(schema.users)
    .where(eq(schema.users.id, me))
    .limit(1)
  const isMod = meRow?.role === 'admin' || meRow?.role === 'owner'
  if (root.authorId !== me && !isMod) {
    return c.json({ error: 'forbidden' }, 403)
  }
  await db
    .update(schema.posts)
    .set({ hiddenAt: new Date() })
    .where(eq(schema.posts.id, post.id))
  c.get('ctx').track('post_hidden', session.user.id)
  return c.json({ ok: true })
})

postsRoute.delete('/:id/hide', requireHandle(), async (c) => {
  const session = c.get('session')!
  const { db } = c.get('ctx')
  const id = c.req.param('id')
  const [post] = await db
    .select({ id: schema.posts.id, rootId: schema.posts.rootId, replyToId: schema.posts.replyToId })
    .from(schema.posts)
    .where(eq(schema.posts.id, id))
    .limit(1)
  if (!post) return c.json({ error: 'not_found' }, 404)
  const rootId = post.rootId ?? post.replyToId
  if (!rootId) return c.json({ error: 'cannot_hide_root' }, 400)
  const [root] = await db
    .select({ authorId: schema.posts.authorId })
    .from(schema.posts)
    .where(eq(schema.posts.id, rootId))
    .limit(1)
  if (!root) return c.json({ error: 'not_found' }, 404)
  const me = session.user.id
  const [meRow] = await db
    .select({ role: schema.users.role })
    .from(schema.users)
    .where(eq(schema.users.id, me))
    .limit(1)
  const isMod = meRow?.role === 'admin' || meRow?.role === 'owner'
  if (root.authorId !== me && !isMod) {
    return c.json({ error: 'forbidden' }, 403)
  }
  await db
    .update(schema.posts)
    .set({ hiddenAt: null })
    .where(eq(schema.posts.id, post.id))
  c.get('ctx').track('post_unhidden', session.user.id)
  return c.json({ ok: true })
})

class HttpError extends Error {
  constructor(public status: number, public code: string) {
    super(code)
  }
}

postsRoute.onError((err, c) => {
  const rl = handleRateLimitError(err, c)
  if (rl) return rl
  if (err instanceof HttpError) return c.json({ error: err.code }, err.status as never)
  console.error(err)
  return c.json({ error: 'internal_error', message: err.message }, 500)
})
