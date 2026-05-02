import Foundation

struct Hashtag: Codable, Identifiable, Hashable, Sendable {
    var id: String { tag }
    let tag: String
    var postCount: Int?
    var trendScore: Double?
}

struct TrendingHashtagsResponse: Codable, Sendable {
    let hashtags: [Hashtag]
    let cached: Bool?
}
