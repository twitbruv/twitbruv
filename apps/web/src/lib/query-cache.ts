import { qk } from "./query-keys"
import type { FeedTabKey } from "./query-keys"
import type {
  InfiniteData,
  QueryClient,
  QueryFilters,
} from "@tanstack/react-query"
import type {
  FeedPage,
  ForYouFeedPage,
  HashtagPage,
  NetworkFeedPage,
  NotificationItem,
  Post,
  Thread,
  ThreadReply,
} from "./api"

export type SearchResultsPage = {
  users: Array<{ id: string } & Record<string, unknown>>
  posts: Array<Post>
}

type NotificationsListPage = {
  notifications: Array<NotificationItem>
  nextCursor: string | null
}

export function patchPostRowDeep(
  row: Post,
  targetId: string,
  mapFn: (p: Post) => Post
): Post {
  if (row.id === targetId) return mapFn(row)
  let next = row
  if (row.repostOf?.id === targetId) {
    next = { ...next, repostOf: mapFn(row.repostOf) }
  }
  if (row.quoteOf?.id === targetId) {
    next = { ...next, quoteOf: mapFn(row.quoteOf) }
  }
  if (row.replyParent?.id === targetId) {
    next = { ...next, replyParent: mapFn(row.replyParent) }
  }
  return next
}

function patchInfiniteFeedPages<T extends FeedPage>(
  old: InfiniteData<T>,
  postId: string,
  mapFn: (p: Post) => Post
): InfiniteData<T> {
  return {
    ...old,
    pages: old.pages.map((page) => ({
      ...page,
      posts: page.posts.map((p) => patchPostRowDeep(p, postId, mapFn)),
    })),
  }
}

function removeFromInfiniteFeedPages<T extends FeedPage>(
  old: InfiniteData<T>,
  postId: string
): InfiniteData<T> {
  return {
    ...old,
    pages: old.pages.map((page) => ({
      ...page,
      posts: page.posts.filter((p) => p.id !== postId),
    })),
  }
}

function prependToFirstInfinitePage<T extends FeedPage>(
  old: InfiniteData<T>,
  post: Post
): InfiniteData<T> {
  if (old.pages.length === 0) return old
  const exists = old.pages.some((page) =>
    page.posts.some((p) => p.id === post.id)
  )
  if (exists) return old
  const [first, ...rest] = old.pages
  return {
    ...old,
    pages: [{ ...first, posts: [post, ...first.posts] }, ...rest],
  }
}

function patchThreadData(
  old: Thread,
  postId: string,
  mapFn: (p: Post) => Post
): Thread {
  const mapReply = (r: ThreadReply): ThreadReply =>
    r.id === postId ? (mapFn(r) as ThreadReply) : r

  return {
    ancestors: old.ancestors.map((a) => (a.id === postId ? mapFn(a) : a)),
    post: old.post && old.post.id === postId ? mapFn(old.post) : old.post,
    replies: old.replies.map(mapReply),
  }
}

function patchSearchResults(
  old: SearchResultsPage,
  postId: string,
  mapFn: (p: Post) => Post
): SearchResultsPage {
  return {
    ...old,
    posts: old.posts.map((p) => patchPostRowDeep(p, postId, mapFn)),
  }
}

function patchNotificationPages(
  old: InfiniteData<NotificationsListPage>,
  postId: string,
  mapFn: (p: Post) => Post
): InfiniteData<NotificationsListPage> {
  return {
    ...old,
    pages: old.pages.map((page) => ({
      ...page,
      notifications: page.notifications.map((n) =>
        n.target
          ? { ...n, target: patchPostRowDeep(n.target, postId, mapFn) }
          : n
      ),
    })),
  }
}

export const feedLikePredicate: QueryFilters["predicate"] = (query) => {
  const key = query.queryKey
  if (!Array.isArray(key) || key.length === 0) return false
  const head = key[0]
  return (
    head === "feed" ||
    head === "userPosts" ||
    head === "bookmarks" ||
    head === "hashtag" ||
    head === "listTimeline" ||
    head === "search"
  )
}

export function updatePostEverywhere(
  qc: QueryClient,
  postId: string,
  mapFn: (p: Post) => Post
) {
  qc.setQueriesData({ predicate: feedLikePredicate }, (data) => {
    if (!data) return data
    if (
      typeof data === "object" &&
      "pages" in data &&
      Array.isArray((data as InfiniteData<FeedPage>).pages)
    ) {
      const inf = data as InfiniteData<
        FeedPage | ForYouFeedPage | HashtagPage | NetworkFeedPage
      >
      return patchInfiniteFeedPages(inf, postId, mapFn)
    }
    if (
      typeof data === "object" &&
      "posts" in data &&
      "users" in data &&
      Array.isArray((data as SearchResultsPage).posts)
    ) {
      return patchSearchResults(data as SearchResultsPage, postId, mapFn)
    }
    return data
  })

  qc.setQueriesData({ queryKey: ["post"] }, (data) => {
    if (
      !data ||
      typeof data !== "object" ||
      !("post" in data) ||
      (data as { post: Post }).post.id !== postId
    ) {
      return data
    }
    return {
      ...(data as { post: Post }),
      post: mapFn((data as { post: Post }).post),
    }
  })

  qc.setQueriesData({ queryKey: ["thread"] }, (data) => {
    if (!data || typeof data !== "object" || !("replies" in data)) return data
    const thread = data as Thread
    const touches =
      thread.post?.id === postId ||
      thread.ancestors.some((a) => a.id === postId) ||
      thread.replies.some((r) => r.id === postId)
    if (!touches) return data
    return patchThreadData(thread, postId, mapFn)
  })

  qc.setQueriesData(
    { queryKey: qk.notifications.list(), exact: true },
    (data) => {
      if (
        !data ||
        typeof data !== "object" ||
        !("pages" in data) ||
        !Array.isArray((data as InfiniteData<NotificationsListPage>).pages)
      ) {
        return data
      }
      return patchNotificationPages(
        data as InfiniteData<NotificationsListPage>,
        postId,
        mapFn
      )
    }
  )
}

export function removePostEverywhere(qc: QueryClient, postId: string) {
  qc.setQueriesData({ predicate: feedLikePredicate }, (data) => {
    if (!data) return data
    if (
      typeof data === "object" &&
      "pages" in data &&
      Array.isArray((data as InfiniteData<FeedPage>).pages)
    ) {
      const inf = data as InfiniteData<
        FeedPage | ForYouFeedPage | HashtagPage | NetworkFeedPage
      >
      return removeFromInfiniteFeedPages(inf, postId)
    }
    if (
      typeof data === "object" &&
      "posts" in data &&
      "users" in data &&
      Array.isArray((data as SearchResultsPage).posts)
    ) {
      const s = data as SearchResultsPage
      return { ...s, posts: s.posts.filter((p) => p.id !== postId) }
    }
    return data
  })

  qc.removeQueries({
    predicate: (q) =>
      Array.isArray(q.queryKey) &&
      q.queryKey[0] === "post" &&
      q.queryKey[1] === postId,
  })

  qc.setQueriesData({ queryKey: ["thread"] }, (data) => {
    if (!data || typeof data !== "object") return data
    const thread = data as Thread
    return {
      ...thread,
      ancestors: thread.ancestors.filter((a) => a.id !== postId),
      post: thread.post?.id === postId ? null : thread.post,
      replies: thread.replies.filter((r) => r.id !== postId),
    }
  })

  qc.invalidateQueries({
    predicate: (q) =>
      Array.isArray(q.queryKey) &&
      q.queryKey[0] === "admin" &&
      q.queryKey[1] === "posts",
  })
}

export function prependPostToFeeds(
  qc: QueryClient,
  post: Post,
  tabs?: ReadonlyArray<FeedTabKey>
) {
  const tabsToUse =
    tabs ??
    ([
      "following",
      "network",
      "all",
    ] as const satisfies ReadonlyArray<FeedTabKey>)
  for (const tab of tabsToUse) {
    qc.setQueryData<InfiniteData<FeedPage>>(qk.feed(tab), (current) => {
      if (!current || current.pages.length === 0) return current
      return prependToFirstInfinitePage(current, post)
    })
  }
}

export function bumpPostCounts(
  qc: QueryClient,
  postId: string,
  field: keyof Post["counts"],
  delta: number
) {
  updatePostEverywhere(qc, postId, (p) => ({
    ...p,
    counts: { ...p.counts, [field]: p.counts[field] + delta },
  }))
}

export function invalidateFeedCaches(qc: QueryClient, postId?: string) {
  qc.invalidateQueries({ predicate: feedLikePredicate })
  if (postId) {
    qc.invalidateQueries({ queryKey: qk.post(postId) })
    qc.invalidateQueries({ queryKey: qk.thread(postId) })
  }
}
