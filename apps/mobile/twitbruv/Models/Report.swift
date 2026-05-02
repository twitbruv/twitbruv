import Foundation

struct ReportBody: Codable, Sendable {
    var subjectType: String
    var subjectId: String
    var reason: String
    var details: String?
}

struct SearchResponse: Codable, Sendable {
    let users: [UserSummary]
    let posts: [Post]
}

struct SavedSearch: Codable, Identifiable, Hashable, Sendable {
    let id: String
    var query: String
    var createdAt: Date?
}

struct SavedSearchesResponse: Codable, Sendable {
    let items: [SavedSearch]
}

struct SavedSearchResponse: Codable, Sendable {
    let item: SavedSearch
}
