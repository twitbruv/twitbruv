import Foundation

struct Message: Codable, Identifiable, Hashable, Sendable {
    let id: String
    var conversationId: String?
    var senderId: String?
    var sender: UserSummary?
    var text: String?
    var media: Media?
    var createdAt: Date
    var editedAt: Date?
    var deletedAt: Date?
    var replyToId: String?
    var replyTo: Indirect<Message>?
    var reactions: [Reaction]?

    struct Reaction: Codable, Hashable, Sendable {
        let emoji: String
        var count: Int
        var byMe: Bool?
        var userIds: [String]?
    }
}

struct MessagesResponse: Codable, Sendable {
    let messages: [Message]
    let nextCursor: String?
}

struct SendMessageBody: Codable, Sendable {
    var text: String?
    var mediaId: String?
    var replyToId: String?
}

struct SentMessageResponse: Codable, Sendable {
    let message: Message
}

struct DMStreamEvent: Codable, Sendable {
    let type: String
    var conversationId: String?
    var message: Message?
    var messageId: String?
    var userId: String?
    var emoji: String?
    var typingUntil: Date?
}
