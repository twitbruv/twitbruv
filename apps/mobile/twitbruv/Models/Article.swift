import Foundation

struct Article: Codable, Identifiable, Hashable, Sendable {
    let id: String
    var slug: String?
    var title: String?
    var subtitle: String?
    var body: String?
    var coverImageUrl: String?
    var author: UserSummary?
    var publishedAt: Date?
    var updatedAt: Date?
    var createdAt: Date?
    var readingTimeMinutes: Int?
}

struct ArticlesResponse: Codable, Sendable {
    let articles: [Article]
    let nextCursor: String?
}

struct ArticleResponse: Codable, Sendable {
    let article: Article
}
