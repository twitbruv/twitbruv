import Foundation

struct Endpoint {
    enum Method: String {
        case GET, POST, PATCH, DELETE
    }

    var method: Method
    var path: String
    var query: [URLQueryItem]

    init(_ method: Method, _ path: String, query: [URLQueryItem] = []) {
        self.method = method
        self.path = path
        self.query = query
    }

    static func appending(_ items: [String: String?]) -> [URLQueryItem] {
        items.compactMap { key, value in
            guard let value = value, !value.isEmpty else { return nil }
            return URLQueryItem(name: key, value: value)
        }
    }
}

enum API {
    enum Auth {
        static func getSession() -> Endpoint { .init(.GET, "/api/auth/get-session") }
        static func signInEmail() -> Endpoint { .init(.POST, "/api/auth/sign-in/email") }
        static func signUpEmail() -> Endpoint { .init(.POST, "/api/auth/sign-up/email") }
        static func signOut() -> Endpoint { .init(.POST, "/api/auth/sign-out") }
        static func sendVerificationEmail() -> Endpoint {
            .init(.POST, "/api/auth/send-verification-email")
        }
        static func magicLink() -> Endpoint {
            .init(.POST, "/api/auth/sign-in/magic-link")
        }
        static func twoFactorVerifyTOTP() -> Endpoint {
            .init(.POST, "/api/auth/two-factor/verify-totp")
        }
        static func twoFactorVerifyBackup() -> Endpoint {
            .init(.POST, "/api/auth/two-factor/verify-backup-code")
        }
    }

    enum Me {
        static func get() -> Endpoint { .init(.GET, "/api/me") }
        static func update() -> Endpoint { .init(.PATCH, "/api/me") }
        static func claimHandle() -> Endpoint { .init(.POST, "/api/me/handle") }
        static func bookmarks(cursor: String?) -> Endpoint {
            .init(.GET, "/api/me/bookmarks", query: Endpoint.appending(["cursor": cursor]))
        }
        static func blocks(cursor: String?) -> Endpoint {
            .init(.GET, "/api/me/blocks", query: Endpoint.appending(["cursor": cursor]))
        }
        static func mutes(cursor: String?) -> Endpoint {
            .init(.GET, "/api/me/mutes", query: Endpoint.appending(["cursor": cursor]))
        }
        static func pushRegister() -> Endpoint { .init(.POST, "/api/me/push/register") }
        static func pushUnregister() -> Endpoint { .init(.DELETE, "/api/me/push/register") }
    }

    enum Users {
        static func get(_ handle: String) -> Endpoint { .init(.GET, "/api/users/\(handle)") }
        static func suggested() -> Endpoint { .init(.GET, "/api/users/suggested") }
        static func posts(_ handle: String, cursor: String?) -> Endpoint {
            .init(.GET, "/api/users/\(handle)/posts", query: Endpoint.appending(["cursor": cursor]))
        }
        static func articles(_ handle: String, cursor: String?) -> Endpoint {
            .init(
                .GET, "/api/users/\(handle)/articles",
                query: Endpoint.appending(["cursor": cursor])
            )
        }
        static func article(_ handle: String, slug: String) -> Endpoint {
            .init(.GET, "/api/users/\(handle)/articles/\(slug)")
        }
        static func followers(_ handle: String, cursor: String?) -> Endpoint {
            .init(
                .GET, "/api/users/\(handle)/followers",
                query: Endpoint.appending(["cursor": cursor])
            )
        }
        static func following(_ handle: String, cursor: String?) -> Endpoint {
            .init(
                .GET, "/api/users/\(handle)/following",
                query: Endpoint.appending(["cursor": cursor])
            )
        }
        static func follow(_ handle: String) -> Endpoint {
            .init(.POST, "/api/users/\(handle)/follow")
        }
        static func unfollow(_ handle: String) -> Endpoint {
            .init(.DELETE, "/api/users/\(handle)/follow")
        }
        static func block(_ handle: String) -> Endpoint {
            .init(.POST, "/api/users/\(handle)/block")
        }
        static func unblock(_ handle: String) -> Endpoint {
            .init(.DELETE, "/api/users/\(handle)/block")
        }
        static func mute(_ handle: String) -> Endpoint {
            .init(.POST, "/api/users/\(handle)/mute")
        }
        static func unmute(_ handle: String) -> Endpoint {
            .init(.DELETE, "/api/users/\(handle)/mute")
        }
    }

    enum Feed {
        static func home(cursor: String?) -> Endpoint {
            .init(.GET, "/api/feed", query: Endpoint.appending(["cursor": cursor]))
        }
        static func network(cursor: String?) -> Endpoint {
            .init(.GET, "/api/feed/network", query: Endpoint.appending(["cursor": cursor]))
        }
        static func discovery(cursor: String?) -> Endpoint {
            .init(.GET, "/api/posts", query: Endpoint.appending(["cursor": cursor]))
        }
    }

    enum Posts {
        static func get(_ id: String) -> Endpoint { .init(.GET, "/api/posts/\(id)") }
        static func thread(_ id: String) -> Endpoint { .init(.GET, "/api/posts/\(id)/thread") }
        static func edits(_ id: String) -> Endpoint { .init(.GET, "/api/posts/\(id)/edits") }
        static func create() -> Endpoint { .init(.POST, "/api/posts") }
        static func edit(_ id: String) -> Endpoint { .init(.PATCH, "/api/posts/\(id)") }
        static func delete(_ id: String) -> Endpoint { .init(.DELETE, "/api/posts/\(id)") }
        static func like(_ id: String) -> Endpoint { .init(.POST, "/api/posts/\(id)/like") }
        static func unlike(_ id: String) -> Endpoint { .init(.DELETE, "/api/posts/\(id)/like") }
        static func bookmark(_ id: String) -> Endpoint {
            .init(.POST, "/api/posts/\(id)/bookmark")
        }
        static func unbookmark(_ id: String) -> Endpoint {
            .init(.DELETE, "/api/posts/\(id)/bookmark")
        }
        static func repost(_ id: String) -> Endpoint { .init(.POST, "/api/posts/\(id)/repost") }
        static func unrepost(_ id: String) -> Endpoint {
            .init(.DELETE, "/api/posts/\(id)/repost")
        }
        static func pin(_ id: String) -> Endpoint { .init(.POST, "/api/posts/\(id)/pin") }
        static func unpin(_ id: String) -> Endpoint { .init(.DELETE, "/api/posts/\(id)/pin") }
        static func hide(_ id: String) -> Endpoint { .init(.POST, "/api/posts/\(id)/hide") }
        static func unhide(_ id: String) -> Endpoint { .init(.DELETE, "/api/posts/\(id)/hide") }
    }

    enum Hashtags {
        static func trending() -> Endpoint { .init(.GET, "/api/hashtags/trending") }
        static func posts(_ tag: String, cursor: String?) -> Endpoint {
            .init(.GET, "/api/hashtags/\(tag)/posts", query: Endpoint.appending(["cursor": cursor]))
        }
    }

    enum Search {
        static func search(_ query: String) -> Endpoint {
            .init(.GET, "/api/search", query: Endpoint.appending(["q": query]))
        }
        static func saved() -> Endpoint { .init(.GET, "/api/search/saved") }
        static func saveQuery() -> Endpoint { .init(.POST, "/api/search/saved") }
        static func deleteSaved(_ id: String) -> Endpoint {
            .init(.DELETE, "/api/search/saved/\(id)")
        }
    }

    enum Media {
        static func intent() -> Endpoint { .init(.POST, "/api/media/intent") }
        static func finalize(_ id: String) -> Endpoint {
            .init(.POST, "/api/media/\(id)/finalize")
        }
        static func get(_ id: String) -> Endpoint { .init(.GET, "/api/media/\(id)") }
        static func setAlt(_ id: String) -> Endpoint { .init(.PATCH, "/api/media/\(id)/alt") }
    }

    enum Articles {
        static func mine(cursor: String?) -> Endpoint {
            .init(.GET, "/api/articles", query: Endpoint.appending(["cursor": cursor]))
        }
        static func get(_ id: String) -> Endpoint { .init(.GET, "/api/articles/\(id)") }
    }

    enum Notifications {
        static func list(cursor: String?, unreadOnly: Bool) -> Endpoint {
            var q: [String: String?] = ["cursor": cursor]
            if unreadOnly { q["unread"] = "1" }
            return .init(.GET, "/api/notifications", query: Endpoint.appending(q))
        }
        static func unreadCount() -> Endpoint { .init(.GET, "/api/notifications/unread-count") }
        static func markRead() -> Endpoint { .init(.POST, "/api/notifications/mark-read") }
    }

    enum DMs {
        static func stream() -> Endpoint { .init(.GET, "/api/dms/stream") }
        static func conversations(folder: String) -> Endpoint {
            .init(.GET, "/api/dms", query: Endpoint.appending(["folder": folder]))
        }
        static func unreadCount() -> Endpoint { .init(.GET, "/api/dms/unread-count") }
        static func start() -> Endpoint { .init(.POST, "/api/dms") }
        static func get(_ id: String) -> Endpoint { .init(.GET, "/api/dms/\(id)") }
        static func rename(_ id: String) -> Endpoint { .init(.PATCH, "/api/dms/\(id)") }
        static func accept(_ id: String) -> Endpoint { .init(.POST, "/api/dms/\(id)/accept") }
        static func decline(_ id: String) -> Endpoint { .init(.POST, "/api/dms/\(id)/decline") }
        static func members(_ id: String) -> Endpoint { .init(.POST, "/api/dms/\(id)/members") }
        static func removeMember(_ id: String, userId: String) -> Endpoint {
            .init(.DELETE, "/api/dms/\(id)/members/\(userId)")
        }
        static func invites(_ id: String) -> Endpoint { .init(.GET, "/api/dms/\(id)/invites") }
        static func createInvite(_ id: String) -> Endpoint {
            .init(.POST, "/api/dms/\(id)/invites")
        }
        static func revokeInvite(_ id: String, inviteId: String) -> Endpoint {
            .init(.DELETE, "/api/dms/\(id)/invites/\(inviteId)")
        }
        static func messages(_ id: String, cursor: String?) -> Endpoint {
            .init(.GET, "/api/dms/\(id)/messages", query: Endpoint.appending(["cursor": cursor]))
        }
        static func sendMessage(_ id: String) -> Endpoint {
            .init(.POST, "/api/dms/\(id)/messages")
        }
        static func editMessage(_ id: String, msgId: String) -> Endpoint {
            .init(.PATCH, "/api/dms/\(id)/messages/\(msgId)")
        }
        static func deleteMessage(_ id: String, msgId: String) -> Endpoint {
            .init(.DELETE, "/api/dms/\(id)/messages/\(msgId)")
        }
        static func toggleReaction(_ id: String, msgId: String) -> Endpoint {
            .init(.POST, "/api/dms/\(id)/messages/\(msgId)/reactions")
        }
        static func typing(_ id: String) -> Endpoint { .init(.POST, "/api/dms/\(id)/typing") }
        static func read(_ id: String) -> Endpoint { .init(.POST, "/api/dms/\(id)/read") }
    }

    enum Invites {
        static func preview(_ token: String) -> Endpoint { .init(.GET, "/api/invites/\(token)") }
        static func accept(_ token: String) -> Endpoint {
            .init(.POST, "/api/invites/\(token)/accept")
        }
    }

    enum Reports {
        static func create() -> Endpoint { .init(.POST, "/api/reports") }
    }

    enum Polls {
        static func vote(_ pollId: String) -> Endpoint {
            .init(.POST, "/api/polls/\(pollId)/vote")
        }
    }

    enum ScheduledPosts {
        static func list(kind: String?) -> Endpoint {
            .init(.GET, "/api/scheduled-posts", query: Endpoint.appending(["kind": kind]))
        }
        static func create() -> Endpoint { .init(.POST, "/api/scheduled-posts") }
        static func update(_ id: String) -> Endpoint { .init(.PATCH, "/api/scheduled-posts/\(id)") }
        static func delete(_ id: String) -> Endpoint {
            .init(.DELETE, "/api/scheduled-posts/\(id)")
        }
        static func publish(_ id: String) -> Endpoint {
            .init(.POST, "/api/scheduled-posts/\(id)/publish")
        }
    }

    enum Lists {
        static func byHandle(_ handle: String) -> Endpoint {
            .init(.GET, "/api/lists/by/\(handle)")
        }
        static func mine() -> Endpoint { .init(.GET, "/api/lists/me") }
        static func create() -> Endpoint { .init(.POST, "/api/lists") }
        static func get(_ id: String) -> Endpoint { .init(.GET, "/api/lists/\(id)") }
        static func update(_ id: String) -> Endpoint { .init(.PATCH, "/api/lists/\(id)") }
        static func delete(_ id: String) -> Endpoint { .init(.DELETE, "/api/lists/\(id)") }
        static func pin(_ id: String) -> Endpoint { .init(.POST, "/api/lists/\(id)/pin") }
        static func unpin(_ id: String) -> Endpoint { .init(.DELETE, "/api/lists/\(id)/pin") }
        static func listedOn(_ handle: String) -> Endpoint {
            .init(.GET, "/api/lists/listed-on/\(handle)")
        }
        static func members(_ id: String) -> Endpoint { .init(.GET, "/api/lists/\(id)/members") }
        static func addMembers(_ id: String) -> Endpoint {
            .init(.POST, "/api/lists/\(id)/members")
        }
        static func removeMember(_ id: String, memberId: String) -> Endpoint {
            .init(.DELETE, "/api/lists/\(id)/members/\(memberId)")
        }
        static func timeline(_ id: String, cursor: String?) -> Endpoint {
            .init(.GET, "/api/lists/\(id)/timeline", query: Endpoint.appending(["cursor": cursor]))
        }
    }

    enum Unfurl {
        static func preview(_ url: String) -> Endpoint {
            .init(.GET, "/api/unfurl/preview", query: Endpoint.appending(["url": url]))
        }
    }

    enum Dev {
        static func seed() -> Endpoint { .init(.POST, "/api/dev/seed") }
    }
}
