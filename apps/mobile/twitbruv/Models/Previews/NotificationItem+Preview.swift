import Foundation

extension NotificationItem {
    static func preview(kind: String, post: Post? = Post.previewText) -> NotificationItem {
        NotificationItem(
            id: "notif-\(kind)",
            type: kind,
            actor: UserSummary.previewPeer,
            post: post,
            conversationId: nil,
            createdAt: Date(),
            readAt: kind == "like" ? nil : Date(),
            meta: nil
        )
    }

    static var previewFeed: [NotificationItem] {
        [
            .preview(kind: "like"),
            .preview(kind: "repost"),
            .preview(kind: "follow", post: nil),
            .preview(kind: "reply"),
            .preview(kind: "quote"),
            .preview(kind: "mention"),
            .preview(kind: "dm", post: nil),
        ]
    }
}
