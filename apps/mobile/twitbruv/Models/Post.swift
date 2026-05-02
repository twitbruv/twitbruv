import Foundation

struct Post: Codable, Identifiable, Hashable, Sendable {
    let id: String
    var text: String
    let createdAt: Date
    var editedAt: Date?
    var visibility: String
    var replyToId: String?
    var quoteOfId: String?
    var repostOfId: String?
    var sensitive: Bool
    var contentWarning: String?
    var replyRestriction: String
    var hidden: Bool?
    var pinned: Bool?
    var author: PostAuthor
    var counts: Counts
    var media: [Media]?
    var cards: [UnfurlCard]?
    var viewer: ViewerFlags?
    var repostOf: Indirect<Post>?
    var quoteOf: Indirect<Post>?
    var replyParent: Indirect<Post>?
    var poll: Poll?

    struct PostAuthor: Codable, Hashable, Sendable {
        let id: String
        let handle: String?
        var displayName: String?
        var avatarUrl: String?
        var isVerified: Bool?
        var isBot: Bool?
        var role: String?
    }

    struct Counts: Codable, Hashable, Sendable {
        var likes: Int
        var reposts: Int
        var replies: Int
        var quotes: Int
        var bookmarks: Int
    }

    struct ViewerFlags: Codable, Hashable, Sendable {
        var liked: Bool
        var bookmarked: Bool
        var reposted: Bool
    }
}

struct Indirect<Wrapped: Codable & Hashable & Sendable>: Codable, Hashable, Sendable {
    private final class Box: Sendable {
        let value: Wrapped
        init(_ value: Wrapped) { self.value = value }
    }
    private let box: Box
    var value: Wrapped { box.value }

    init(_ value: Wrapped) { self.box = Box(value) }

    init(from decoder: Decoder) throws {
        let v = try Wrapped(from: decoder)
        self.box = Box(v)
    }

    func encode(to encoder: Encoder) throws {
        try box.value.encode(to: encoder)
    }

    static func == (lhs: Indirect<Wrapped>, rhs: Indirect<Wrapped>) -> Bool {
        lhs.box.value == rhs.box.value
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(box.value)
    }
}

struct PostsResponse: Codable, Sendable {
    let posts: [Post]
    let nextCursor: String?
}

struct PostsHashtagResponse: Codable, Sendable {
    let posts: [Post]
    let nextCursor: String?
    let tag: String?
}

struct SinglePostResponse: Codable, Sendable {
    let post: Post
}

struct ThreadResponse: Codable, Sendable {
    let post: Post
    let ancestors: [Post]?
    let replies: [Post]?
}

struct CreatePostBody: Codable, Sendable {
    var text: String
    var replyToId: String?
    var quoteOfId: String?
    var repostOfId: String?
    var mediaIds: [String]?
    var visibility: String?
    var sensitive: Bool?
    var contentWarning: String?
    var replyRestriction: String?
    var poll: PollInput?

    struct PollInput: Codable, Sendable {
        var options: [String]
        var durationSeconds: Int
        var allowMultiple: Bool
    }
}
