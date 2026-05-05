import { getTrackingIds } from "@databuddy/sdk"
import { API_URL, MAINTENANCE_MODE } from "./env"
import { setRuntimeMaintenance } from "./maintenance"
import type { GithubCard } from "@workspace/github-unfurl/card"
import type { GenericUnfurlCard as GenericUnfurlPayload } from "@workspace/url-unfurl-core"
import type { XStatusCard as XStatusPayload } from "@workspace/x-unfurl/card"
import type { YouTubeCard } from "@workspace/youtube-unfurl/card"

export type { GithubCard } from "@workspace/github-unfurl/card"
export type { YouTubeCard } from "@workspace/youtube-unfurl/card"

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message)
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // Build-time kill switch: refuse to even hit the network so a cached client
  // can't keep abusing the API while we're locked down.
  if (MAINTENANCE_MODE) {
    throw new ApiError(503, "maintenance", "maintenance")
  }
  const trackingHeaders: Record<string, string> = {}
  const { anonId, sessionId } = getTrackingIds()
  if (anonId) trackingHeaders["X-Db-Anon-Id"] = anonId
  if (sessionId) trackingHeaders["X-Db-Session-Id"] = sessionId

  const res = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...trackingHeaders,
      ...(init?.headers ?? {}),
    },
    ...init,
  })
  if (!res.ok) {
    const raw: unknown = await res.json().catch(() => null)
    const body =
      raw && typeof raw === "object" && !Array.isArray(raw)
        ? (raw as Record<string, unknown>)
        : null
    const code = typeof body?.error === "string" ? body.error : "unknown"
    const messageStr = typeof body?.message === "string" ? body.message : null
    if (res.status === 503 && code === "maintenance") {
      setRuntimeMaintenance(true, messageStr)
    }
    throw new ApiError(res.status, code, messageStr ?? res.statusText)
  }
  return (await res.json()) as T
}

const h = (handle: string) => handle.replace(/^@/, "")
const qs = (cursor?: string) =>
  cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""

export const api = {
  me: () => request<{ user: SelfUser }>("/api/me"),
  updateMe: (body: Partial<SelfUser>) =>
    request<{ user: SelfUser }>("/api/me", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  claimHandle: (handle: string) =>
    request<{ user: SelfUser }>("/api/me/handle", {
      method: "POST",
      body: JSON.stringify({ handle }),
    }),
  updateExperiments: (body: Partial<Experiments>) =>
    request<{ experiments: Experiments }>("/api/me/experiments", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  user: (handle: string) =>
    request<{ user: PublicProfile }>(`/api/users/${h(handle)}`),
  userPosts: (handle: string, cursor?: string) =>
    request<FeedPage>(`/api/users/${h(handle)}/posts${qs(cursor)}`),
  followers: (handle: string, cursor?: string) =>
    request<UserListPage>(`/api/users/${h(handle)}/followers${qs(cursor)}`),
  following: (handle: string, cursor?: string) =>
    request<UserListPage>(`/api/users/${h(handle)}/following${qs(cursor)}`),
  suggestedUsers: (limit?: number) =>
    request<{ users: Array<PublicUser> }>(
      `/api/users/suggested${limit ? `?limit=${limit}` : ""}`
    ),

  follow: (handle: string) =>
    request<{ ok: true }>(`/api/users/${h(handle)}/follow`, { method: "POST" }),
  unfollow: (handle: string) =>
    request<{ ok: true }>(`/api/users/${h(handle)}/follow`, {
      method: "DELETE",
    }),
  block: (handle: string) =>
    request<{ ok: true }>(`/api/users/${h(handle)}/block`, { method: "POST" }),
  unblock: (handle: string) =>
    request<{ ok: true }>(`/api/users/${h(handle)}/block`, {
      method: "DELETE",
    }),
  mute: (handle: string, scope: "feed" | "notifications" | "both" = "feed") =>
    request<{ ok: true }>(`/api/users/${h(handle)}/mute`, {
      method: "POST",
      body: JSON.stringify({ scope }),
    }),
  unmute: (handle: string) =>
    request<{ ok: true }>(`/api/users/${h(handle)}/mute`, { method: "DELETE" }),

  feed: (cursor?: string) => request<FeedPage>(`/api/feed${qs(cursor)}`),
  networkFeed: (cursor?: string) =>
    request<NetworkFeedPage>(`/api/feed/network${qs(cursor)}`),
  forYouFeed: (cursor?: string) =>
    request<ForYouFeedPage>(`/api/feed/for-you${qs(cursor)}`),
  publicTimeline: (cursor?: string) =>
    request<FeedPage>(`/api/posts${qs(cursor)}`),
  hashtag: (tag: string, cursor?: string) =>
    request<HashtagPage>(
      `/api/hashtags/${encodeURIComponent(tag.replace(/^#/, ""))}/posts${qs(cursor)}`
    ),
  trendingHashtags: () =>
    request<{
      hashtags: Array<{ tag: string; postCount: number }>
      cached: boolean
    }>("/api/hashtags/trending"),
  search: (q: string) =>
    request<{ users: Array<PublicUser>; posts: Array<Post> }>(
      `/api/search?q=${encodeURIComponent(q)}`
    ),
  savedSearches: () =>
    request<{ items: Array<SavedSearch> }>("/api/search/saved"),
  saveSearch: (query: string) =>
    request<{ item: SavedSearch }>("/api/search/saved", {
      method: "POST",
      body: JSON.stringify({ query }),
    }),
  deleteSavedSearch: (id: string) =>
    request<{ ok: true }>(`/api/search/saved/${id}`, { method: "DELETE" }),
  bookmarks: (cursor?: string) =>
    request<FeedPage>(`/api/me/bookmarks${qs(cursor)}`),
  blocks: (cursor?: string) =>
    request<{ users: Array<BlockedUser>; nextCursor: string | null }>(
      `/api/me/blocks${qs(cursor)}`
    ),
  mutes: (cursor?: string) =>
    request<{ users: Array<MutedUser>; nextCursor: string | null }>(
      `/api/me/mutes${qs(cursor)}`
    ),

  notifications: (cursor?: string, unreadOnly = false) => {
    const tail = unreadOnly ? (cursor ? "&unread=1" : "?unread=1") : ""
    return request<{
      notifications: Array<NotificationItem>
      nextCursor: string | null
    }>(`/api/notifications${qs(cursor)}${tail}`)
  },
  notificationsUnreadCount: () =>
    request<{ count: number }>("/api/notifications/unread-count"),
  notificationsMarkRead: (body: { ids?: Array<string>; all?: boolean }) =>
    request<{ ok: true }>("/api/notifications/mark-read", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  analyticsOverview: (days = 28) =>
    request<AnalyticsOverview>(`/api/analytics/overview?days=${days}`),

  dmConversations: (folder: "inbox" | "requests" = "inbox") =>
    request<{
      conversations: Array<DmConversation>
      requestCount: number
      folder: "inbox" | "requests"
    }>(`/api/dms?folder=${folder}`),
  dmConversation: (conversationId: string) =>
    request<{ conversation: DmConversationDetail }>(
      `/api/dms/${conversationId}`
    ),
  dmUnreadCount: () =>
    request<{ count: number; requestCount: number }>("/api/dms/unread-count"),
  dmAcceptRequest: (conversationId: string) =>
    request<{ ok: true }>(`/api/dms/${conversationId}/accept`, {
      method: "POST",
    }),
  dmDeclineRequest: (conversationId: string) =>
    request<{ ok: true }>(`/api/dms/${conversationId}/decline`, {
      method: "POST",
    }),
  dmStart: (userId: string) =>
    request<{ id: string; created: boolean }>("/api/dms", {
      method: "POST",
      body: JSON.stringify({ userId }),
    }),
  dmCreateGroup: (userIds: Array<string>, title?: string) =>
    request<{ id: string; created: boolean }>("/api/dms", {
      method: "POST",
      body: JSON.stringify({ userIds, title }),
    }),
  dmRename: (conversationId: string, title: string | null) =>
    request<{ ok: true }>(`/api/dms/${conversationId}`, {
      method: "PATCH",
      body: JSON.stringify({ title }),
    }),
  dmAddMembers: (conversationId: string, userIds: Array<string>) =>
    request<{ ok: true; added: number }>(`/api/dms/${conversationId}/members`, {
      method: "POST",
      body: JSON.stringify({ userIds }),
    }),
  dmRemoveMember: (conversationId: string, userId: string) =>
    request<{ ok: true }>(`/api/dms/${conversationId}/members/${userId}`, {
      method: "DELETE",
    }),
  dmLeave: (conversationId: string, myUserId: string) =>
    request<{ ok: true }>(`/api/dms/${conversationId}/members/${myUserId}`, {
      method: "DELETE",
    }),
  dmTyping: (conversationId: string) =>
    request<{ ok: true }>(`/api/dms/${conversationId}/typing`, {
      method: "POST",
    }),
  dmEditMessage: (conversationId: string, messageId: string, text: string) =>
    request<{ ok: true; editedAt: string }>(
      `/api/dms/${conversationId}/messages/${messageId}`,
      { method: "PATCH", body: JSON.stringify({ text }) }
    ),
  dmDeleteMessage: (conversationId: string, messageId: string) =>
    request<{ ok: true }>(`/api/dms/${conversationId}/messages/${messageId}`, {
      method: "DELETE",
    }),
  dmToggleReaction: (
    conversationId: string,
    messageId: string,
    emoji: string
  ) =>
    request<{ ok: true; op: "add" | "remove" }>(
      `/api/dms/${conversationId}/messages/${messageId}/reactions`,
      { method: "POST", body: JSON.stringify({ emoji }) }
    ),
  dmCreateInvite: (
    conversationId: string,
    body: { expiresInHours?: number; maxUses?: number } = {}
  ) =>
    request<{ invite: DmInvite }>(`/api/dms/${conversationId}/invites`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  dmInvites: (conversationId: string) =>
    request<{ invites: Array<DmInvite> }>(`/api/dms/${conversationId}/invites`),
  dmRevokeInvite: (conversationId: string, inviteId: string) =>
    request<{ ok: true }>(`/api/dms/${conversationId}/invites/${inviteId}`, {
      method: "DELETE",
    }),
  invitePreview: (token: string) =>
    request<{ invite: InvitePreview }>(
      `/api/invites/${encodeURIComponent(token)}`
    ),
  inviteAccept: (token: string) =>
    request<{ id: string }>(
      `/api/invites/${encodeURIComponent(token)}/accept`,
      {
        method: "POST",
      }
    ),
  dmMessages: (conversationId: string, cursor?: string) =>
    request<{ messages: Array<DmMessage>; nextCursor: string | null }>(
      `/api/dms/${conversationId}/messages${qs(cursor)}`
    ),
  dmSend: (
    conversationId: string,
    body: {
      text?: string
      sharedPostId?: string
      sharedArticleId?: string
      mediaId?: string
    }
  ) =>
    request<{ message: DmMessage }>(`/api/dms/${conversationId}/messages`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  dmMarkRead: (conversationId: string, messageId?: string) =>
    request<{ ok: true }>(`/api/dms/${conversationId}/read`, {
      method: "POST",
      body: JSON.stringify(messageId ? { messageId } : {}),
    }),

  createArticle: (body: ArticleInput) =>
    request<{ article: ArticleDto }>("/api/articles", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateArticle: (id: string, body: Partial<ArticleInput>) =>
    request<{ article: ArticleDto }>(`/api/articles/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  article: (id: string) =>
    request<{ article: ArticleDto }>(`/api/articles/${id}`),
  deleteArticle: (id: string) =>
    request<{ ok: true }>(`/api/articles/${id}`, { method: "DELETE" }),
  myArticles: (cursor?: string) =>
    request<{
      articles: Array<ArticleListItem>
      nextCursor: string | null
    }>(`/api/articles${qs(cursor)}`),
  userArticles: (handle: string, cursor?: string) =>
    request<{
      articles: Array<{
        id: string
        slug: string
        title: string
        subtitle: string | null
        readingMinutes: number
        publishedAt: string | null
      }>
      nextCursor: string | null
    }>(`/api/users/${h(handle)}/articles${qs(cursor)}`),
  userArticleBySlug: (handle: string, slug: string) =>
    request<{ article: ArticleDto }>(
      `/api/users/${h(handle)}/articles/${encodeURIComponent(slug)}`
    ),

  createPost: (body: {
    text: string
    replyToId?: string
    quoteOfId?: string
    mediaIds?: Array<string>
    poll?: PollInput
    /** Who can reply to this post. Defaults to anyone server-side. */
    replyRestriction?: "anyone" | "following" | "mentioned"
  }) =>
    request<{ post: Post }>("/api/posts", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  votePoll: (pollId: string, optionIds: Array<string>) =>
    request<{ ok: true }>(`/api/polls/${pollId}/vote`, {
      method: "POST",
      body: JSON.stringify({ optionIds }),
    }),

  // Drafts + scheduled posts. `kind` filters to only-drafts or only-scheduled.
  scheduledPosts: (kind?: "draft" | "scheduled") =>
    request<{ items: Array<ScheduledPost> }>(
      `/api/scheduled-posts${kind ? `?kind=${kind}` : ""}`
    ),
  createScheduledPost: (body: ScheduledPostInput) =>
    request<{ item: ScheduledPost }>("/api/scheduled-posts", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateScheduledPost: (id: string, body: Partial<ScheduledPostInput>) =>
    request<{ item: ScheduledPost }>(`/api/scheduled-posts/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteScheduledPost: (id: string) =>
    request<{ ok: true }>(`/api/scheduled-posts/${id}`, { method: "DELETE" }),
  publishScheduledPost: (id: string) =>
    request<{ postId: string }>(`/api/scheduled-posts/${id}/publish`, {
      method: "POST",
    }),

  // Lists.
  myLists: () => request<{ lists: Array<UserList> }>("/api/lists/me"),
  userLists: (handle: string) =>
    request<{ lists: Array<UserList> }>(`/api/lists/by/${h(handle)}`),
  list: (id: string) => request<{ list: UserList }>(`/api/lists/${id}`),
  createList: (body: {
    slug: string
    title: string
    description?: string
    isPrivate?: boolean
  }) =>
    request<{ list: UserList }>("/api/lists", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateList: (
    id: string,
    body: Partial<{
      title: string
      description: string | null
      isPrivate: boolean
    }>
  ) =>
    request<{ list: UserList }>(`/api/lists/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteList: (id: string) =>
    request<{ ok: true }>(`/api/lists/${id}`, { method: "DELETE" }),
  listMembers: (id: string) =>
    request<{ members: Array<UserListMember> }>(`/api/lists/${id}/members`),
  addListMembers: (id: string, userIds: Array<string>) =>
    request<{ ok: true; added: number }>(`/api/lists/${id}/members`, {
      method: "POST",
      body: JSON.stringify({ userIds }),
    }),
  removeListMember: (id: string, memberId: string) =>
    request<{ ok: true }>(`/api/lists/${id}/members/${memberId}`, {
      method: "DELETE",
    }),
  listTimeline: (id: string, cursor?: string) =>
    request<FeedPage>(`/api/lists/${id}/timeline${qs(cursor)}`),
  pinList: (id: string) =>
    request<{ ok: true }>(`/api/lists/${id}/pin`, { method: "POST" }),
  unpinList: (id: string) =>
    request<{ ok: true }>(`/api/lists/${id}/pin`, { method: "DELETE" }),
  listsListedOn: (handle: string) =>
    request<{ lists: Array<UserList> }>(`/api/lists/listed-on/${h(handle)}`),
  post: (id: string) => request<{ post: Post }>(`/api/posts/${id}`),
  thread: (id: string) => request<Thread>(`/api/posts/${id}/thread`),
  deletePost: (id: string) =>
    request<{ ok: true }>(`/api/posts/${id}`, { method: "DELETE" }),
  editPost: (id: string, text: string) =>
    request<{ post: Post }>(`/api/posts/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ text }),
    }),
  postEdits: (id: string) =>
    request<{ edits: Array<PostEdit> }>(`/api/posts/${id}/edits`),

  like: (id: string) =>
    request<{ ok: true }>(`/api/posts/${id}/like`, { method: "POST" }),
  unlike: (id: string) =>
    request<{ ok: true }>(`/api/posts/${id}/like`, { method: "DELETE" }),
  bookmark: (id: string) =>
    request<{ ok: true }>(`/api/posts/${id}/bookmark`, { method: "POST" }),
  unbookmark: (id: string) =>
    request<{ ok: true }>(`/api/posts/${id}/bookmark`, { method: "DELETE" }),
  repost: (id: string) =>
    request<{ ok: true }>(`/api/posts/${id}/repost`, { method: "POST" }),
  unrepost: (id: string) =>
    request<{ ok: true }>(`/api/posts/${id}/repost`, { method: "DELETE" }),
  hidePost: (id: string) =>
    request<{ ok: true }>(`/api/posts/${id}/hide`, { method: "POST" }),
  unhidePost: (id: string) =>
    request<{ ok: true }>(`/api/posts/${id}/hide`, { method: "DELETE" }),
  pinPost: (id: string) =>
    request<{ ok: true }>(`/api/posts/${id}/pin`, { method: "POST" }),
  unpinPost: (id: string) =>
    request<{ ok: true }>(`/api/posts/${id}/pin`, { method: "DELETE" }),

  adminStats: () => request<AdminStats>(`/api/admin/stats`),
  adminOnline: () => request<AdminOnline>(`/api/admin/online`),
  adminUsers: (q?: string, cursor?: string) => {
    const params = new URLSearchParams()
    if (q) params.set("q", q)
    if (cursor) params.set("cursor", cursor)
    return request<{ users: Array<AdminUser>; nextCursor: string | null }>(
      `/api/admin/users${params.toString() ? `?${params.toString()}` : ""}`
    )
  },
  adminUser: (id: string) => request<AdminUserDetail>(`/api/admin/users/${id}`),
  adminBan: (id: string, body: { reason?: string; durationHours?: number }) =>
    request<{ ok: true }>(`/api/admin/users/${id}/ban`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  adminUnban: (id: string) =>
    request<{ ok: true }>(`/api/admin/users/${id}/unban`, { method: "POST" }),
  adminShadowban: (id: string, body: { reason?: string }) =>
    request<{ ok: true }>(`/api/admin/users/${id}/shadowban`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  adminUnshadowban: (id: string) =>
    request<{ ok: true }>(`/api/admin/users/${id}/unshadowban`, {
      method: "POST",
    }),
  adminSetRole: (id: string, role: "user" | "admin" | "owner") =>
    request<{ ok: true }>(`/api/admin/users/${id}/role`, {
      method: "POST",
      body: JSON.stringify({ role }),
    }),
  adminSetHandle: (id: string, body: { handle: string; reason?: string }) =>
    request<{ ok: true }>(`/api/admin/users/${id}/handle`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  adminDeleteUser: (id: string, body: { reason?: string } = {}) =>
    request<{ ok: true }>(`/api/admin/users/${id}`, {
      method: "DELETE",
      body: JSON.stringify(body),
    }),
  adminVerify: (id: string, reason?: string) =>
    request<{ ok: true }>(`/api/admin/users/${id}/verify`, {
      method: "POST",
      body: JSON.stringify(reason ? { reason } : {}),
    }),
  adminUnverify: (id: string, reason?: string) =>
    request<{ ok: true }>(`/api/admin/users/${id}/unverify`, {
      method: "POST",
      body: JSON.stringify(reason ? { reason } : {}),
    }),
  adminGrantContributor: (id: string, reason?: string) =>
    request<{ ok: true }>(`/api/admin/users/${id}/contributor`, {
      method: "POST",
      body: JSON.stringify(reason ? { reason } : {}),
    }),
  adminRevokeContributor: (id: string, reason?: string) =>
    request<{ ok: true }>(`/api/admin/users/${id}/contributor`, {
      method: "DELETE",
      body: JSON.stringify(reason ? { reason } : {}),
    }),
  adminReports: (status?: ReportStatus, cursor?: string) => {
    const params = new URLSearchParams()
    if (status) params.set("status", status)
    if (cursor) params.set("cursor", cursor)
    return request<{ reports: Array<AdminReport>; nextCursor: string | null }>(
      `/api/admin/reports${params.toString() ? `?${params.toString()}` : ""}`
    )
  },
  adminReportDetail: (id: string) =>
    request<AdminReportDetail>(`/api/admin/reports/${id}`),
  adminResolveReport: (
    id: string,
    body: {
      status: "triaged" | "actioned" | "dismissed"
      resolutionNote?: string
    }
  ) =>
    request<{ ok: true }>(`/api/admin/reports/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  adminPosts: (
    params: {
      q?: string
      cursor?: string
      sort?: AdminPostSort
      order?: "asc" | "desc"
      type?: AdminPostType | "any"
      visibility?: "public" | "followers" | "unlisted" | "any"
      status?: "active" | "deleted" | "sensitive" | "any"
    } = {}
  ) => {
    const sp = new URLSearchParams()
    if (params.q) sp.set("q", params.q)
    if (params.cursor) sp.set("cursor", params.cursor)
    if (params.sort) sp.set("sort", params.sort)
    if (params.order) sp.set("order", params.order)
    if (params.type && params.type !== "any") sp.set("type", params.type)
    if (params.visibility && params.visibility !== "any")
      sp.set("visibility", params.visibility)
    if (params.status && params.status !== "any")
      sp.set("status", params.status)
    return request<{ posts: Array<AdminPost>; nextCursor: string | null }>(
      `/api/admin/posts${sp.toString() ? `?${sp.toString()}` : ""}`
    )
  },
  adminDeletePost: (
    id: string,
    body: { reason?: string; reportId?: string } = {}
  ) =>
    request<{ ok: true }>(`/api/admin/posts/${id}`, {
      method: "DELETE",
      body: JSON.stringify(body),
    }),

  report: (body: {
    subjectType: "post" | "user" | "article" | "message"
    subjectId: string
    reason: ReportReason
    details?: string
  }) =>
    request<{ id: string | null; deduped: boolean }>("/api/reports", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  // Connectors — currently just GitHub for the contributions graph + pinned repos.
  connectorsGithubMe: () =>
    request<GithubConnectorMe>("/api/connectors/github/me"),
  connectorsGithubStartUrl: () => `${API_URL}/api/connectors/github/start`,
  connectorsGithubDisconnect: () =>
    request<{ ok: true }>("/api/connectors/github", { method: "DELETE" }),
  connectorsGithubRefresh: () =>
    request<{ ok: true; refreshedAt: string; stale: boolean }>(
      "/api/connectors/github/refresh",
      { method: "POST" }
    ),
  connectorsGithubSetVisibility: (showOnProfile: boolean) =>
    request<{ ok: true }>("/api/connectors/github/me", {
      method: "PATCH",
      body: JSON.stringify({ showOnProfile }),
    }),
  userGithub: (handle: string) =>
    request<GithubProfilePayload>(`/api/users/${h(handle)}/github`),

  chessActiveGames: () =>
    request<{ games: Array<ChessGame> }>("/api/chess/active"),
  chessPendingGames: () =>
    request<{
      games: Array<{
        id: string
        whitePlayerId: string
        blackPlayerId: string
        createdAt: string
        challenger: PublicUser
      }>
    }>("/api/chess/pending"),
  chessAcceptGame: (id: string) =>
    request<{ game: ChessGame }>(`/api/chess/${id}/accept`, { method: "POST" }),
  chessDeclineGame: (id: string) =>
    request<{ game: ChessGame }>(`/api/chess/${id}/decline`, {
      method: "POST",
    }),
  chessLeaderboard: () =>
    request<{ leaderboard: Array<ChessStats> }>("/api/chess/leaderboard"),
  chessGame: (id: string) => request<{ game: ChessGame }>(`/api/chess/${id}`),
  chessCreateGame: (opponentId: string) =>
    request<{ game: ChessGame }>("/api/chess", {
      method: "POST",
      body: JSON.stringify({ opponentId }),
    }),
  chessMove: (gameId: string, move: string) =>
    request<{ game: ChessGame }>(`/api/chess/${gameId}/move`, {
      method: "POST",
      body: JSON.stringify({ move }),
    }),

  unfurlPreview: (url: string) =>
    request<UnfurlPreview>(
      `/api/unfurl/preview?url=${encodeURIComponent(url)}`
    ),
}

export type ReportReason =
  | "spam"
  | "harassment"
  | "csam"
  | "violence"
  | "impersonation"
  | "illegal"
  | "other"

export interface PostEdit {
  id: string
  previousText: string
  editedAt: string
}

export interface PostArticleCard {
  id: string
  slug: string
  title: string
  subtitle: string | null
  readingMinutes: number
  publishedAt: string | null
  authorHandle: string | null
}

export type ArticleUnfurlCard = PostArticleCard & {
  provider: "article"
  kind: "article"
}

export type GithubUnfurlCard = GithubCard & { provider: "github" }

export type YoutubeUnfurlCard = YouTubeCard & { provider: "youtube" }

export type GenericUnfurlCard = GenericUnfurlPayload & { provider: "generic" }

export type XUnfurlCard = XStatusPayload & { provider: "x" }

export type UnfurlCard =
  | ArticleUnfurlCard
  | GithubUnfurlCard
  | YoutubeUnfurlCard
  | GenericUnfurlCard
  | XUnfurlCard

export interface UnfurlPreview {
  url: string
  title: string
  description: string | null
  imageUrl: string | null
  siteName: string | null
}

export interface Post {
  id: string
  text: string
  createdAt: string
  editedAt: string | null
  visibility: "public" | "followers" | "unlisted"
  rootId: string | null
  conversationDepth: number
  replyToId: string | null
  quoteOfId: string | null
  repostOfId: string | null
  sensitive: boolean
  contentWarning: string | null
  replyRestriction: "anyone" | "following" | "mentioned"
  /** Set when the conversation root author hid this reply. The thread renderer
   *  collapses these by default behind a "Show hidden replies" affordance. */
  hidden?: boolean
  author: {
    id: string
    handle: string | null
    displayName: string | null
    avatarUrl: string | null
    isVerified: boolean
    isBot: boolean
    isContributor: boolean
    role: "user" | "admin" | "owner"
  }
  counts: {
    likes: number
    reposts: number
    replies: number
    quotes: number
    bookmarks: number
  }
  viewer?: {
    liked: boolean
    bookmarked: boolean
    reposted: boolean
  }
  media?: Array<PostMedia>
  cards?: Array<UnfurlCard>
  /** Populated on repost rows: the original post to render with a "reposted by" banner. */
  repostOf?: Post
  quoteOf?: Post
  /** Populated on reply rows: the parent post this row is replying to, rendered as a small
   *  embed above the post so feed readers have conversation context. Not recursive. */
  replyParent?: Post
  /** Set when this row is the pinned post on a profile feed. */
  pinned?: boolean
  /** Optional poll attached to this post. */
  poll?: PollDto
  /** Home/public feed: root + collapsed gap + leaf for deep reply threads. */
  chainPreview?: { root: Post; omittedCount: number }
  /** For replies: the handles of users in the reply chain (from root to immediate parent).
   *  Used to show "Replying to @user1, @user2, ..." in notifications. */
  replyChainHandles?: Array<string>
}

export interface PollOption {
  id: string
  position: number
  text: string
  voteCount: number
}

export interface PollDto {
  id: string
  closesAt: string
  allowMultiple: boolean
  totalVotes: number
  closed: boolean
  options: Array<PollOption>
  viewerVoteOptionIds?: Array<string>
}

export interface PollInput {
  options: Array<string>
  durationMinutes: number
  allowMultiple: boolean
}

export interface ScheduledPost {
  id: string
  text: string
  mediaIds: Array<string>
  visibility: "public" | "followers" | "unlisted"
  replyRestriction: "anyone" | "following" | "mentioned"
  sensitive: boolean
  contentWarning: string | null
  scheduledFor: string | null
  publishedAt: string | null
  publishedPostId: string | null
  failedAt: string | null
  failureReason: string | null
  createdAt: string
  updatedAt: string
}

export interface ScheduledPostInput {
  text: string
  mediaIds?: Array<string>
  visibility?: "public" | "followers" | "unlisted"
  replyRestriction?: "anyone" | "following" | "mentioned"
  sensitive?: boolean
  contentWarning?: string
  /** ISO timestamp; null/undefined = save as draft. */
  scheduledFor?: string | null
}

export interface UserList {
  id: string
  ownerId: string
  ownerHandle: string | null
  ownerDisplayName: string | null
  slug: string
  title: string
  description: string | null
  isPrivate: boolean
  memberCount: number
  pinnedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface UserListMember {
  id: string
  handle: string | null
  displayName: string | null
  avatarUrl: string | null
  isVerified: boolean
  isContributor: boolean
  role: "user" | "admin" | "owner"
  addedAt: string
}

export interface PostMedia {
  id: string
  kind: "image" | "video" | "gif"
  mimeType?: string | null
  width: number | null
  height: number | null
  blurhash: string | null
  altText: string | null
  processingState: "pending" | "processing" | "ready" | "failed" | "flagged"
  variants: Array<{ kind: string; url: string; width: number; height: number }>
}

export interface NetworkActor {
  id: string
  handle: string | null
  displayName: string | null
}

export interface NetworkPost extends Post {
  /** Up to 3 follows that liked or reposted this post. The full count is in
   *  `networkActorTotal`. Surfaces the "Lucas + N others liked this" banner. */
  networkActors: Array<NetworkActor>
  networkActorTotal: number
  networkActivityAt: string
}

export interface NetworkFeedPage {
  posts: Array<NetworkPost>
  nextCursor: string | null
}

export interface FeedPage {
  posts: Array<Post>
  nextCursor: string | null
}

export interface ForYouFeedPage extends FeedPage {
  algoVersion: string
  variant: string
  fallback?: boolean
  restartRequired?: boolean
}

export interface HashtagPage extends FeedPage {
  tag: string
}

export interface PublicUser {
  id: string
  handle: string | null
  displayName: string | null
  bio: string | null
  avatarUrl: string | null
  bannerUrl: string | null
  isVerified: boolean
  isBot: boolean
  isContributor: boolean
  role: "user" | "admin" | "owner"
  createdAt: string
}

export interface PublicProfile extends PublicUser {
  location: string | null
  websiteUrl: string | null
  counts: {
    followers: number
    following: number
    posts: number
  }
  viewer?: {
    following: boolean
    blocking: boolean
    muting: boolean
  }
}

export interface UserListPage {
  users: Array<PublicUser>
  nextCursor: string | null
}

export interface BlockedUser {
  id: string
  handle: string | null
  displayName: string | null
  avatarUrl: string | null
  isVerified: boolean
  isContributor: boolean
  role: "user" | "admin" | "owner"
  blockedAt: string
}

export interface ThreadReply extends Post {
  /** Number of direct (non-deleted) replies to this reply. The thread route only ships
   *  the first hop of replies; if this is non-zero, the UI shows a
   *  "View N more replies" affordance that opens the reply's own thread page.
   */
  descendantReplyCount: number
}

export interface Thread {
  ancestors: Array<Post>
  post: Post | null
  replies: Array<ThreadReply>
}

export interface MutedUser {
  id: string
  handle: string | null
  displayName: string | null
  avatarUrl: string | null
  isVerified: boolean
  isContributor: boolean
  role: "user" | "admin" | "owner"
  mutedAt: string
  scope: "feed" | "notifications" | "both"
}

export interface Experiments {
  forYouFeed: boolean
}

export interface SelfUser {
  id: string
  email: string
  emailVerified: boolean
  handle: string | null
  displayName: string | null
  bio: string | null
  location: string | null
  websiteUrl: string | null
  avatarUrl: string | null
  bannerUrl: string | null
  birthday: string | null
  isVerified: boolean
  isBot: boolean
  isContributor: boolean
  role: "user" | "admin" | "owner"
  locale: string
  timezone: string | null
  createdAt: string
  experiments: Experiments
}

export interface SavedSearch {
  id: string
  query: string
  createdAt?: string
}

export interface Thread {
  ancestors: Array<Post>
  post: Post | null
  replies: Array<ThreadReply>
}

export interface NotificationItem {
  id: string
  kind:
    | "like"
    | "repost"
    | "reply"
    | "mention"
    | "follow"
    | "article_reply"
    | "quote"
  createdAt: string
  readAt: string | null
  entityType: string | null
  entityId: string | null
  actor: {
    id: string
    handle: string | null
    displayName: string | null
    avatarUrl: string | null
    isVerified: boolean
    isContributor: boolean
    role: "user" | "admin" | "owner"
  } | null
  /** Hydrated for kinds whose entity is a post (like / repost / reply / mention / quote /
   *  article_reply). Null when the post was deleted or the kind has no associated post. */
  target: Post | null
}

export interface ArticleInput {
  title: string
  subtitle?: string
  slug?: string
  coverMediaId?: string | null
  bodyFormat?: "lexical" | "prosemirror" | "markdown"
  bodyJson?: unknown
  bodyText: string
  status?: "draft" | "published" | "unlisted"
}

export interface ArticleListItem {
  id: string
  slug: string
  title: string
  subtitle: string | null
  status: "draft" | "published" | "unlisted"
  publishedAt: string | null
  wordCount: number
  readingMinutes: number
}

export interface ArticleDto {
  id: string
  slug: string
  title: string
  subtitle: string | null
  bodyFormat: "lexical" | "prosemirror" | "markdown"
  bodyJson: unknown
  bodyText: string
  wordCount: number
  readingMinutes: number
  status: "draft" | "published" | "unlisted"
  publishedAt: string | null
  editedAt: string | null
  likeCount: number
  bookmarkCount: number
  replyCount: number
  crosspostPostId: string | null
  coverMediaId?: string | null
  coverUrl?: string | null
  author: {
    id: string
    handle: string | null
    displayName: string | null
    avatarUrl: string | null
    isVerified: boolean
    isContributor: boolean
    role: "user" | "admin" | "owner"
  }
}

export interface DmMember {
  id: string
  handle: string | null
  displayName: string | null
  avatarUrl: string | null
  isVerified: boolean
  isContributor: boolean
  role: "user" | "admin" | "owner"
}

export type DmRequestState = "none" | "pending" | "accepted" | "declined"

export interface DmConversation {
  id: string
  kind: "dm" | "group"
  title: string | null
  createdAt: string
  lastMessageAt: string | null
  unreadCount: number
  members: Array<DmMember>
  requestState: DmRequestState
  lastMessage: {
    id: string
    senderId: string
    kind: "text" | "media" | "post_share" | "article_share" | "system"
    text: string | null
    createdAt: string
  } | null
}

export interface DmConversationDetail {
  id: string
  kind: "dm" | "group"
  title: string | null
  createdAt: string
  myRole: "member" | "admin"
  myRequestState: DmRequestState
  members: Array<
    DmMember & {
      chatRole: "member" | "admin"
      lastReadMessageId: string | null
    }
  >
}

export interface DmInvite {
  id: string
  token: string
  expiresAt: string | null
  maxUses: number | null
  usedCount: number
  revokedAt: string | null
  createdAt: string
}

export interface InvitePreview {
  conversation: {
    id: string
    kind: "dm" | "group"
    title: string | null
    memberCount: number
    previewMembers: Array<{
      id: string
      handle: string | null
      displayName: string | null
      avatarUrl: string | null
      isVerified: boolean
      isContributor: boolean
      role: "user" | "admin" | "owner"
    }>
  }
  expiresAt: string | null
  maxUses: number | null
  usedCount: number
}

export interface DmMessage {
  id: string
  conversationId: string
  senderId: string
  kind: "text" | "media" | "post_share" | "article_share" | "system"
  text: string | null
  sharedPostId: string | null
  sharedArticleId: string | null
  media: PostMedia | null
  reactions: Array<{ emoji: string; userId: string }>
  deletedAt?: string | null
  editedAt: string | null
  createdAt: string
  sender?: DmMember
}

export type ReportStatus = "open" | "triaged" | "actioned" | "dismissed"

export interface AdminStats {
  users: {
    total: number
    active: number
    banned: number
    shadowBanned: number
    deleted: number
    verified: number
    admins: number
    newToday: number
    newThisWeek: number
  }
  posts: {
    total: number
    original: number
    replies: number
    reposts: number
    quotes: number
    deleted: number
    sensitive: number
    edited: number
    newToday: number
    newThisWeek: number
    totalImpressions: number
  }
  engagement: {
    likes: number
    likesToday: number
    bookmarks: number
    reposts: number
    quotes: number
    replies: number
  }
  social: {
    follows: number
    followsToday: number
    blocks: number
    mutes: number
  }
  messaging: {
    conversations: number
    messages: number
  }
  reports: {
    total: number
    open: number
    triaged: number
    actioned: number
    dismissed: number
  }
}

export interface AdminOnline {
  count: number
  presenceUnavailable?: boolean
  sample: Array<{
    id: string
    handle: string | null
    displayName: string | null
    avatarUrl: string | null
  }>
}

export type AdminPostSort =
  | "created"
  | "likes"
  | "reposts"
  | "replies"
  | "quotes"
  | "bookmarks"
  | "impressions"

export type AdminPostType = "original" | "reply" | "repost" | "quote"

export interface AdminPost {
  id: string
  authorId: string
  author: {
    id: string
    handle: string | null
    displayName: string | null
    avatarUrl: string | null
    isVerified: boolean
    isContributor: boolean
    role: "user" | "admin" | "owner"
  } | null
  text: string
  postType: AdminPostType
  visibility: "public" | "followers" | "unlisted"
  sensitive: boolean
  likeCount: number
  repostCount: number
  replyCount: number
  quoteCount: number
  bookmarkCount: number
  impressionCount: number
  editedAt: string | null
  deletedAt: string | null
  createdAt: string
  reportsOpen: number
  reportsTotal: number
}

export interface AdminUser {
  id: string
  email: string
  handle: string | null
  displayName: string | null
  avatarUrl: string | null
  role: "user" | "admin" | "owner"
  banned: boolean
  banReason: string | null
  banExpires: string | null
  shadowBannedAt: string | null
  isVerified: boolean
  isContributor: boolean
  contributorCheckedAt: string | null
  deletedAt: string | null
  createdAt: string
  postsCount: number
  followersCount: number
  followingCount: number
  openReportsCount: number
  reportsTotalCount?: number
}

export interface AdminUserDetail {
  user: AdminUser & { bio: string | null; bannerUrl: string | null }
  recentPosts: Array<{
    id: string
    text: string
    createdAt: string
    deletedAt: string | null
    sensitive: boolean
    replyToId: string | null
  }>
  reports: Array<{
    id: string
    reporterId: string
    reason: string
    details: string | null
    status: ReportStatus
    createdAt: string
  }>
  actions: Array<{
    id: string
    moderatorId: string | null
    action: string
    publicReason: string | null
    privateNote: string | null
    durationHours: number | null
    createdAt: string
  }>
}

export interface AdminReport {
  id: string
  subjectType: string
  subjectId: string
  reason: string
  details: string | null
  status: ReportStatus
  createdAt: string
  resolvedAt: string | null
  reporter: {
    id: string
    handle: string | null
    displayName: string | null
    avatarUrl: string | null
  } | null
  subjectPreview:
    | { kind: "post"; authorHandle: string | null; textPreview: string }
    | { kind: "user"; handle: string | null; displayName: string | null }
    | { kind: "other"; subjectType: string }
}

export type AdminReportSubject =
  | {
      type: "post"
      post: {
        id: string
        text: string
        sensitive: boolean
        contentWarning: string | null
        createdAt: string
        deletedAt: string | null
        author: {
          id: string
          handle: string | null
          displayName: string | null
          avatarUrl: string | null
        } | null
      }
    }
  | {
      type: "user"
      user: {
        id: string
        handle: string | null
        displayName: string | null
        avatarUrl: string | null
        banned: boolean
      }
    }
  | { type: "unknown"; subjectType: string; subjectId: string }

export interface AdminReportDetail {
  id: string
  subjectType: string
  subjectId: string
  reason: string
  details: string | null
  status: ReportStatus
  createdAt: string
  resolvedAt: string | null
  resolutionNote: string | null
  reporter: {
    id: string
    handle: string | null
    displayName: string | null
    avatarUrl: string | null
  } | null
  subject: AdminReportSubject | null
  linkedModerationActions: Array<{
    id: string
    moderatorId: string | null
    action: string
    publicReason: string | null
    privateNote: string | null
    durationHours: number | null
    createdAt: string
  }>
}

export interface AnalyticsOverview {
  period: { days: number; since: string }
  totals: {
    impressions: number
    engagements: number
    likes: number
    reposts: number
    replies: number
    bookmarks: number
    quotes: number
    newFollowers: number
    engagementRate: number
  }
  snapshot: {
    followerCount: number
    followingCount: number
    originalPosts: number
    repostsAuthored: number
    articlesPublished: number
  }
  followerGrowth: Array<{ day: string; newFollowers: number }>
  impressionsByDay: Array<{ day: string; count: number }>
  topPosts: Array<Post>
}

export interface GithubContributionDay {
  date: string
  count: number
  color: string
}

export interface GithubContributionWeek {
  days: Array<GithubContributionDay>
}

export interface GithubContributions {
  totalContributions: number
  weeks: Array<GithubContributionWeek>
}

export interface GithubPinnedRepo {
  id: string
  name: string
  nameWithOwner: string
  description: string | null
  url: string
  stars: number
  forks: number
  primaryLanguage: { name: string; color: string | null } | null
}

export interface GithubConnectorContributor {
  isContributor: boolean
  contributorCheckedAt: string | null
  repos: Array<string>
}

export type GithubConnectorMe =
  | {
      connected: false
      configured: boolean
      contributor?: GithubConnectorContributor
    }
  | {
      connected: true
      configured: true
      login: string
      scopes: Array<string>
      showOnProfile: boolean
      needsReconnect: boolean
      refreshedAt: string | null
      lastFailureAt: string | null
      lastFailureReason: string | null
      contributor: GithubConnectorContributor
    }

export type GithubProfilePayload =
  | { connected: false }
  | {
      connected: true
      login: string
      name: string | null
      htmlUrl: string
      avatarUrl: string
      followers: number
      following: number
      publicRepos: number
      contributions: GithubContributions
      pinned: Array<GithubPinnedRepo>
      refreshedAt: string
      stale: boolean
    }

export interface ChessGame {
  id: string
  whitePlayerId: string
  blackPlayerId: string
  fen: string
  pgn: string
  status: "ongoing" | "checkmate" | "draw" | "resigned" | "timeout" | "aborted"
  winnerId: string | null
  createdAt: string
  updatedAt: string
}

export interface ChessStats {
  userId: string
  elo: number
  wins: number
  losses: number
  draws: number
  name: string | null
  handle: string | null
  displayName: string | null
  avatarUrl: string | null
}
