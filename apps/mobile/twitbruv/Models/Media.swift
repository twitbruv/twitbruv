import Foundation

struct Media: Codable, Identifiable, Hashable, Sendable {
    let id: String
    var kind: String
    var mimeType: String?
    var width: Int?
    var height: Int?
    var blurhash: String?
    var altText: String?
    var processingState: String?
    var variants: [Variant]?

    struct Variant: Codable, Hashable, Sendable {
        let kind: String
        let url: String
        let width: Int?
        let height: Int?
    }

    var bestURL: URL? {
        let preferredOrder = ["display", "thumb", "original"]
        let candidates = (variants ?? [])
        for kind in preferredOrder {
            if let v = candidates.first(where: { $0.kind == kind }) {
                return URL(string: v.url)
            }
        }
        if let v = candidates.first { return URL(string: v.url) }
        return nil
    }

    var thumbURL: URL? {
        guard let v = (variants ?? []).first(where: { $0.kind == "thumb" }) else {
            return bestURL
        }
        return URL(string: v.url)
    }
}

struct MediaIntentBody: Codable, Sendable {
    let mime: String
    let size: Int
}

struct MediaIntentResponse: Codable, Sendable {
    let mediaId: String
    let uploadUrl: String
    let uploadHeaders: [String: String]?
    let key: String?
}

struct MediaResponse: Codable, Sendable {
    let media: Media
}

struct UnfurlCard: Codable, Hashable, Sendable {
    let url: String
    var kind: String?
    var title: String?
    var description: String?
    var siteName: String?
    var imageUrl: String?
    var faviconUrl: String?
    var publishedAt: String?
}

struct UnfurlPreviewResponse: Codable, Sendable {
    let card: UnfurlCard?
}
