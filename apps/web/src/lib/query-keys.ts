export type FeedTabKey = "following" | "network" | "all" | "forYou"

export type AdminPostFilters = {
  q?: string
  cursor?: string
  sort?: string
  order?: "asc" | "desc"
  type?: string
  visibility?: string
  status?: string
}

export type AdminUsersFilters = {
  q?: string
  cursor?: string
}

export const qk = {
  me: () => ["me"] as const,

  user: (handle: string) => ["user", handle] as const,

  userPosts: (handle: string) => ["userPosts", handle] as const,

  userFollowers: (handle: string) => ["userFollowers", handle] as const,

  userFollowing: (handle: string) => ["userFollowing", handle] as const,

  userLists: (handle: string) => ["lists", "byHandle", handle] as const,

  listsListedOn: (handle: string) => ["lists", "listedOn", handle] as const,

  post: (id: string) => ["post", id] as const,

  thread: (id: string) => ["thread", id] as const,

  postEdits: (id: string) => ["postEdits", id] as const,

  feed: (tab: FeedTabKey, restartToken?: number) =>
    restartToken === undefined
      ? (["feed", tab] as const)
      : (["feed", tab, restartToken] as const),

  bookmarks: () => ["bookmarks"] as const,

  hashtag: (tag: string) => ["hashtag", tag] as const,

  trending: () => ["trendingHashtags"] as const,

  suggestedUsers: () => ["suggestedUsers"] as const,

  search: (q: string) => ["search", q] as const,

  savedSearches: () => ["savedSearches"] as const,

  lists: {
    mine: () => ["lists", "mine"] as const,
    detail: (id: string) => ["lists", "detail", id] as const,
    members: (id: string) => ["lists", "members", id] as const,
    timeline: (id: string) => ["listTimeline", id] as const,
  },

  notifications: {
    list: () => ["notifications"] as const,
    unread: () => ["notifications", "unread"] as const,
  },

  dms: {
    conversations: (folder: "inbox" | "requests") =>
      ["dms", "conversations", folder] as const,
    conversationsAll: () => ["dms", "conversations"] as const,
    detail: (id: string) => ["dms", "detail", id] as const,
    messages: (conversationId: string) =>
      ["dms", "messages", conversationId] as const,
    unread: () => ["dms", "unread"] as const,
  },

  scheduled: (kind?: "draft" | "scheduled") =>
    ["scheduledPosts", kind ?? "all"] as const,

  analytics: (days: number) => ["analytics", days] as const,

  connectors: {
    githubMe: () => ["connectors", "github", "me"] as const,
    userGithub: (handle: string) =>
      ["connectors", "github", "user", handle] as const,
  },

  blocks: () => ["blocks"] as const,

  mutes: () => ["mutes"] as const,

  articles: {
    byId: (id: string) => ["articles", id] as const,
    mine: () => ["articles", "mine"] as const,
    userBySlug: (handle: string, slug: string) =>
      ["articles", "user", handle, slug] as const,
  },

  chess: {
    game: (id: string) => ["chess", "game", id] as const,
    pending: () => ["chess", "pending"] as const,
    active: () => ["chess", "active"] as const,
    leaderboard: () => ["chess", "leaderboard"] as const,
    dmMessages: (conversationId: string) =>
      ["chess", "dmMessages", conversationId] as const,
  },

  admin: {
    stats: () => ["admin", "stats"] as const,
    online: () => ["admin", "online"] as const,
    users: (filters: AdminUsersFilters) => ["admin", "users", filters] as const,
    user: (id: string) => ["admin", "user", id] as const,
    posts: (filters: AdminPostFilters) => ["admin", "posts", filters] as const,
    reports: (status?: string) =>
      ["admin", "reports", status ?? "all"] as const,
    report: (id: string) => ["admin", "report", id] as const,
  },

  invitePreview: (token: string) => ["invitePreview", token] as const,
}
