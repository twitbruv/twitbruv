import Foundation

#if DEBUG
enum PreviewBootstrap {
    @MainActor
    static func environment(authState: AuthState) -> AppEnvironment {
        let session = makeSession()
        let api = APIClient(baseURL: Config.apiBaseURL, session: session)
        let env = AppEnvironment(previewApi: api)
        env.auth.previewReplaceState(authState)
        return env
    }

    private static func makeSession() -> URLSession {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [PreviewURLProtocol.self] + (config.protocolClasses ?? [])
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        config.urlCache = nil
        config.httpCookieStorage = HTTPCookieStorage.shared
        config.httpAdditionalHeaders = [
            "Origin": Config.mobileOrigin,
            "Accept": "application/json",
        ]
        return URLSession(configuration: config)
    }
}

enum PreviewHTTP {
    static func dispatch(_ request: URLRequest) -> (Int, Data) {
        let path = request.url?.path ?? ""
        let method = request.httpMethod ?? "GET"
        let comps = path.split(separator: "/").map(String.init)

        if comps == ["api", "dms", "stream"] {
            return (503, Data())
        }

        if comps == ["api", "me"] {
            if method == "GET" || method == "PATCH" {
                return ok(CurrentUserResponse(user: .preview))
            }
        }

        if comps == ["api", "me", "handle"], method == "POST" {
            return ok(CurrentUserResponse(user: .preview))
        }

        if comps == ["api", "me", "bookmarks"] {
            return ok(PostsResponse(posts: Post.previewFeed, nextCursor: nil))
        }

        if comps == ["api", "me", "blocks"] || comps == ["api", "me", "mutes"] {
            return ok(UsersListResponse(users: UserSummary.previewList, nextCursor: nil))
        }

        if comps == ["api", "notifications", "unread-count"] {
            return ok(NotificationsUnreadCountResponse(count: 3, unread: nil))
        }

        if comps == ["api", "notifications", "mark-read"], method == "POST" {
            return okEmpty()
        }

        if comps == ["api", "notifications"], method == "GET" {
            return ok(
                NotificationsResponse(
                    notifications: NotificationItem.previewFeed,
                    nextCursor: nil
                )
            )
        }

        if let u = matchUsersProfile(comps: comps) {
            return ok(ProfileResponse(user: u))
        }

        if let posts = matchUserPosts(comps: comps) {
            return ok(posts)
        }

        if let usersList = matchUserFollowersOrFollowing(comps: comps) {
            return ok(usersList)
        }

        if let articles = matchUserArticlesList(comps: comps) {
            return ok(articles)
        }

        if let article = matchUserArticle(comps: comps) {
            return ok(article)
        }

        if comps == ["api", "feed"] || comps == ["api", "feed", "network"] {
            return ok(PostsResponse(posts: Post.previewFeed, nextCursor: nil))
        }

        if comps == ["api", "posts"], method == "GET" {
            return ok(PostsResponse(posts: Post.previewFeed, nextCursor: nil))
        }

        if comps.count == 4, comps[0] == "api", comps[1] == "posts", comps[3] == "thread" {
            let id = String(comps[2])
            let main = Post.previewFeed.first { $0.id == id } ?? .previewText
            return ok(
                ThreadResponse(
                    post: main,
                    ancestors: [
                        Post.previewShell(
                            id: "post-ancestor-1",
                            text: "Thread starter",
                            author: Post.previewPeerAuthor
                        ),
                    ],
                    replies: [
                        Post.previewShell(
                            id: "post-reply-1",
                            text: "Nice thread.",
                            author: Post.previewPeerAuthor
                        ),
                    ]
                )
            )
        }

        if comps.count == 3, comps[0] == "api", comps[1] == "posts", method == "GET" {
            let id = String(comps[2])
            let post = Post.previewFeed.first { $0.id == id } ?? .previewText
            return ok(SinglePostResponse(post: post))
        }

        if comps == ["api", "dms"], method == "GET" {
            return ok(
                ConversationsResponse(
                    conversations: [.previewDirect],
                    requestCount: 1,
                    folder: nil
                )
            )
        }

        if comps == ["api", "dms", "unread-count"] {
            return ok(UnreadCountResponse(count: 2, requestCount: nil, unread: nil))
        }

        if comps.count == 3, comps[0] == "api", comps[1] == "dms" {
            if String(comps[2]) == PreviewConst.conversationId {
                return ok(ConversationDetailResponse(conversation: .previewDirect))
            }
        }

        if comps.count == 4, comps[0] == "api", comps[1] == "dms", comps[3] == "messages" {
            if method == "GET" {
                return ok(
                    MessagesResponse(
                        messages: [.previewInbound, .previewOutbound],
                        nextCursor: nil
                    )
                )
            }
            if method == "POST" {
                return ok(SentMessageResponse(message: .previewOutbound))
            }
        }

        if comps.count == 4, comps[0] == "api", comps[1] == "dms" {
            if comps[3] == "read" || comps[3] == "typing" {
                return okEmpty()
            }
        }

        if comps == ["api", "hashtags", "trending"] {
            return ok(TrendingHashtagsResponse(hashtags: Hashtag.previewTrending, cached: nil))
        }

        if comps.count == 4, comps[0] == "api", comps[1] == "hashtags", comps[3] == "posts" {
            let tag = String(comps[2])
            return ok(
                PostsHashtagResponse(
                    posts: Post.previewFeed,
                    nextCursor: nil,
                    tag: tag
                )
            )
        }

        if comps == ["api", "search", "saved"] {
            if method == "GET" {
                return ok(SavedSearchesResponse(items: SavedSearch.previewList))
            }
            if method == "POST" {
                let item = SavedSearch(id: "saved-new", query: "new", createdAt: Date())
                return ok(SavedSearchResponse(item: item))
            }
        }

        if comps.count == 4, comps[0] == "api", comps[1] == "search", comps[2] == "saved" {
            if method == "DELETE" {
                return okEmpty()
            }
        }

        if comps == ["api", "search"], method == "GET" {
            return ok(
                SearchResponse(
                    users: [.previewPeer],
                    posts: Array(Post.previewFeed.prefix(2))
                )
            )
        }

        if comps == ["api", "lists", "me"] {
            return ok(ListsResponse(lists: [.preview]))
        }

        if comps == ["api", "lists"], method == "POST" {
            return ok(ListResponse(list: .preview))
        }

        if comps.count == 4, comps[0] == "api", comps[1] == "lists" {
            let last = comps[3]
            if last == "timeline" {
                return ok(PostsResponse(posts: Post.previewFeed, nextCursor: nil))
            }
            if last == "members" {
                if method == "GET" {
                    return ok(ListMembersResponse(members: UserSummary.previewList, nextCursor: nil))
                }
                if method == "POST" {
                    return okEmpty()
                }
            }
        }

        if comps == ["api", "scheduled-posts"], method == "GET" {
            return ok(
                ScheduledPostsResponse(
                    items: [.previewScheduled, .previewDraft],
                    posts: nil,
                    nextCursor: nil
                )
            )
        }

        if comps == ["api", "scheduled-posts"], method == "POST" {
            return ok(ScheduledPostResponse(item: .previewScheduled, post: nil))
        }

        if comps.count == 4,
            comps[0] == "api",
            comps[1] == "scheduled-posts",
            comps[3] == "publish",
            method == "POST"
        {
            return okEmpty()
        }

        if comps.count == 3, comps[0] == "api", comps[1] == "scheduled-posts" {
            if method == "DELETE" {
                return okEmpty()
            }
            if method == "PATCH" {
                return ok(ScheduledPostResponse(item: .previewScheduled, post: nil))
            }
        }

        if comps == ["api", "unfurl", "preview"] {
            return ok(UnfurlPreviewResponse(card: .preview))
        }

        if comps == ["api", "posts"], method == "POST" {
            return ok(SinglePostResponse(post: .previewText))
        }

        if comps == ["api", "dev", "seed"] {
            return ok(DevSeedResponse(ok: true, message: "Preview seed noop."))
        }

        if comps.first == "api", comps.contains("auth") {
            return okEmpty()
        }

        if method != "GET" {
            return okEmpty()
        }

        let miss = "{\"error\":\"preview_miss\",\"message\":\"\(path)\"}"
        return (404, miss.data(using: .utf8)!)
    }

    private static func matchUsersProfile(comps: [String]) -> PublicUser? {
        guard comps.count == 3, comps[0] == "api", comps[1] == "users" else { return nil }
        let h = comps[2]
        if h == PreviewConst.handle { return .previewSelf }
        if h == PreviewConst.peerHandle { return .previewPeer }
        return .previewPeer
    }

    private static func matchUserPosts(comps: [String]) -> PostsResponse? {
        guard comps.count == 4, comps[0] == "api", comps[1] == "users", comps[3] == "posts"
        else { return nil }
        return PostsResponse(posts: Post.previewFeed, nextCursor: nil)
    }

    private static func matchUserFollowersOrFollowing(comps: [String]) -> UsersListResponse? {
        guard comps.count == 4, comps[0] == "api", comps[1] == "users" else { return nil }
        if comps[3] == "followers" || comps[3] == "following" {
            return UsersListResponse(users: UserSummary.previewList, nextCursor: nil)
        }
        return nil
    }

    private static func matchUserArticlesList(comps: [String]) -> ArticlesResponse? {
        guard comps.count == 4, comps[0] == "api", comps[1] == "users", comps[3] == "articles"
        else { return nil }
        return ArticlesResponse(articles: [.preview], nextCursor: nil)
    }

    private static func matchUserArticle(comps: [String]) -> ArticleResponse? {
        guard comps.count == 5, comps[0] == "api", comps[1] == "users", comps[3] == "articles"
        else { return nil }
        return ArticleResponse(article: .preview)
    }

    private static func ok<T: Encodable>(_ value: T) -> (Int, Data) {
        (200, enc(value))
    }

    private static func okEmpty() -> (Int, Data) {
        (200, "{}".data(using: .utf8)!)
    }

    private static func enc<T: Encodable>(_ value: T) -> Data {
        (try? JSONCoders.encoder.encode(value)) ?? Data()
    }
}
#else
enum PreviewSupportUnavailable {}
#endif
