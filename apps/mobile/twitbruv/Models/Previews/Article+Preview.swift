import Foundation

extension Article {
    static var preview: Article {
        Article(
            id: "article-preview-1",
            slug: PreviewConst.articleSlug,
            title: "Preview article title",
            subtitle: "Subtitle for the reader layout",
            body: "This is **markdown** body text for previews.\n\nSecond paragraph.",
            coverImageUrl: nil,
            author: .preview,
            publishedAt: Date(),
            updatedAt: nil,
            createdAt: Date(),
            readingTimeMinutes: 3
        )
    }
}
