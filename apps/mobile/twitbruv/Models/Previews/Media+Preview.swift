import Foundation

extension Media {
    static var previewImage: Media {
        Media(
            id: "media-preview-1",
            kind: "image",
            mimeType: "image/jpeg",
            width: 1200,
            height: 800,
            blurhash: nil,
            altText: "Preview",
            processingState: "ready",
            variants: [
                Variant(
                    kind: "thumb",
                    url: "https://example.invalid/preview-thumb.jpg",
                    width: 400,
                    height: 267
                ),
            ]
        )
    }
}

extension UnfurlCard {
    static var preview: UnfurlCard {
        UnfurlCard(
            url: "https://example.com/article",
            kind: "link",
            title: "Example article",
            description: "A short unfurl description for previews.",
            siteName: "Example",
            imageUrl: nil,
            faviconUrl: nil,
            publishedAt: nil
        )
    }
}
