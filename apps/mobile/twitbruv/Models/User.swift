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
    var createdAt: Date?

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

struct GithubContributionDay: Codable, Sendable, Hashable {
    let date: String
    let count: Int
    let color: String
}

struct GithubContributionWeek: Codable, Sendable, Hashable {
    let days: [GithubContributionDay]
}

struct GithubContributions: Codable, Sendable, Hashable {
    let totalContributions: Int
    let weeks: [GithubContributionWeek]
}

struct GithubLanguage: Codable, Sendable, Hashable {
    let name: String
    let color: String?
}

struct GithubPinnedRepo: Codable, Sendable, Identifiable, Hashable {
    let id: String
    let name: String
    let nameWithOwner: String
    let description: String?
    let url: String
    let stars: Int
    let forks: Int
    let primaryLanguage: GithubLanguage?
}

struct GithubProfilePayload: Codable, Sendable, Hashable {
    let connected: Bool
    let login: String?
    let name: String?
    let htmlUrl: String?
    let avatarUrl: String?
    let followers: Int?
    let following: Int?
    let publicRepos: Int?
    let contributions: GithubContributions?
    let pinned: [GithubPinnedRepo]?
    let refreshedAt: String?
    let stale: Bool?
}
