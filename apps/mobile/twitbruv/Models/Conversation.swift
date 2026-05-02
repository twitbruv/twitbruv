import Foundation

struct Conversation: Codable, Identifiable, Hashable, Sendable {
    let id: String
    var kind: String?
    var name: String?
    var members: [UserSummary]?
    var lastMessage: Message?
    var lastMessageAt: Date?
    var unreadCount: Int?
    var requestState: String?
    var isGroup: Bool?
    var avatarUrl: String?
    var createdAt: Date?
}

struct ConversationsResponse: Codable, Sendable {
    let conversations: [Conversation]
    let requestCount: Int?
    let folder: String?
}

struct ConversationDetailResponse: Codable, Sendable {
    let conversation: Conversation
}

struct UnreadCountResponse: Codable, Sendable {
    let count: Int?
    let requestCount: Int?
    let unread: Int?
}

struct StartDMBody: Codable, Sendable {
    var userIds: [String]
    var name: String?
}

struct ConversationInvite: Codable, Identifiable, Hashable, Sendable {
    let id: String
    var token: String?
    var url: String?
    var createdAt: Date?
    var expiresAt: Date?
}

struct ConversationInvitesResponse: Codable, Sendable {
    let invites: [ConversationInvite]
}

struct CreateInviteResponse: Codable, Sendable {
    let invite: ConversationInvite
}

struct InvitePreviewResponse: Codable, Sendable {
    let conversation: Conversation?
    let inviter: UserSummary?
    let memberCount: Int?
    let alreadyMember: Bool?
}
