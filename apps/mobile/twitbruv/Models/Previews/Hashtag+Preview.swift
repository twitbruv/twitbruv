import Foundation

extension Hashtag {
    static var previewTrending: [Hashtag] {
        [
            Hashtag(tag: "dev", postCount: 1201, trendScore: 1.2),
            Hashtag(tag: "swift", postCount: 890, trendScore: 0.9),
            Hashtag(tag: "ios", postCount: 450, trendScore: 0.5),
        ]
    }
}

extension SavedSearch {
    static var previewList: [SavedSearch] {
        [
            SavedSearch(id: "saved-1", query: "swift preview", createdAt: Date()),
            SavedSearch(id: "saved-2", query: "design", createdAt: Date()),
        ]
    }
}
