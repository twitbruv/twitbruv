import Foundation

struct NotificationItem: Codable, Identifiable, Hashable, Sendable {
    let id: String
    var type: String
    var actor: UserSummary?
    var post: Post?
    var conversationId: String?
    var createdAt: Date
    var readAt: Date?
    var meta: [String: String]?
}

struct NotificationsResponse: Codable, Sendable {
    let notifications: [NotificationItem]
    let nextCursor: String?
}

struct NotificationsUnreadCountResponse: Codable, Sendable {
    let count: Int?
    let unread: Int?

    var value: Int { count ?? unread ?? 0 }
}

struct MarkReadBody: Codable, Sendable {
    var ids: [String]?
    var all: Bool?
}
