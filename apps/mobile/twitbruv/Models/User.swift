import Foundation

struct PublicUser: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let handle: String?
    var displayName: String?
    var avatarUrl: String?
    var bio: String?
    var location: String?
    var websiteUrl: String?
    var bannerUrl: String?
    var isVerified: Bool?
    var isBot: Bool?
    var role: String?
    var counts: Counts?
    var viewer: ViewerFlags?

    struct Counts: Codable, Hashable, Sendable {
        var followers: Int?
        var following: Int?
        var posts: Int?
    }

    struct ViewerFlags: Codable, Hashable, Sendable {
        var following: Bool?
        var followedBy: Bool?
        var blocking: Bool?
        var muting: Bool?
    }
}

struct CurrentUser: Codable, Identifiable, Hashable, Sendable {
    let id: String
    var email: String
    var emailVerified: Bool
    var handle: String?
    var displayName: String?
    var bio: String?
    var location: String?
    var websiteUrl: String?
    var avatarUrl: String?
    var bannerUrl: String?
    var birthday: String?
    var isVerified: Bool?
    var isBot: Bool?
    var role: String?
    var locale: String?
    var timezone: String?
    var createdAt: Date?
}

struct UserSummary: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let handle: String?
    var displayName: String?
    var avatarUrl: String?
    var isVerified: Bool?
    var bio: String?
    var role: String?
}

struct ProfileResponse: Codable, Sendable {
    let user: PublicUser
}

struct CurrentUserResponse: Codable, Sendable {
    let user: CurrentUser
}

struct UsersListResponse: Codable, Sendable {
    let users: [UserSummary]
    let nextCursor: String?
}

struct SuggestedUsersResponse: Codable, Sendable {
    let users: [UserSummary]
}
