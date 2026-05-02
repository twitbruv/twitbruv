import Foundation

struct ScheduledPost: Codable, Identifiable, Hashable, Sendable {
    let id: String
    var kind: String
    var text: String
    var mediaIds: [String]?
    var visibility: String?
    var sensitive: Bool?
    var contentWarning: String?
    var replyRestriction: String?
    var scheduledAt: Date?
    var createdAt: Date?
    var updatedAt: Date?
    var publishedAt: Date?
}

struct ScheduledPostsResponse: Codable, Sendable {
    let items: [ScheduledPost]?
    let posts: [ScheduledPost]?
    let nextCursor: String?

    var values: [ScheduledPost] { items ?? posts ?? [] }
}

struct ScheduledPostResponse: Codable, Sendable {
    let item: ScheduledPost?
    let post: ScheduledPost?

    var value: ScheduledPost? { item ?? post }
}

struct ScheduledPostBody: Codable, Sendable {
    var kind: String
    var text: String
    var mediaIds: [String]?
    var visibility: String?
    var sensitive: Bool?
    var contentWarning: String?
    var replyRestriction: String?
    var scheduledAt: Date?
}
