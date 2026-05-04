import Foundation

extension Post {
    static var previewAuthor: PostAuthor {
        PostAuthor(
            id: PreviewConst.userId,
            handle: PreviewConst.handle,
            displayName: "Preview User",
            avatarUrl: nil,
            isVerified: true,
            isBot: false,
            role: nil
        )
    }

    static var previewPeerAuthor: PostAuthor {
        PostAuthor(
            id: PreviewConst.peerUserId,
            handle: PreviewConst.peerHandle,
            displayName: "Peer User",
            avatarUrl: nil,
            isVerified: false,
            isBot: false,
            role: nil
        )
    }

    static func previewShell(
        id: String,
        text: String,
        author: PostAuthor = Post.previewAuthor,
        repostOf: Indirect<Post>? = nil,
        quoteOf: Indirect<Post>? = nil,
        poll: Poll? = nil,
        media: [Media]? = nil,
        contentWarning: String? = nil
    ) -> Post {
        Post(
            id: id,
            text: text,
            createdAt: Date(),
            editedAt: nil,
            visibility: "public",
            replyToId: nil,
            quoteOfId: nil,
            repostOfId: nil,
            sensitive: contentWarning != nil,
            contentWarning: contentWarning,
            replyRestriction: "everyone",
            hidden: false,
            pinned: false,
            author: author,
            counts: Counts(
                likes: 12,
                reposts: 2,
                replies: 4,
                quotes: 1,
                bookmarks: 0
            ),
            media: media,
            cards: nil,
            viewer: ViewerFlags(liked: false, bookmarked: false, reposted: false),
            repostOf: repostOf,
            quoteOf: quoteOf,
            replyParent: nil,
            poll: poll
        )
    }

    static var previewText: Post {
        previewShell(
            id: PreviewConst.threadPostId,
            text: "This is a preview post on the home feed."
        )
    }

    static var previewLong: Post {
        previewShell(
            id: "post-preview-long",
            text: String(
                repeating: "Long body text for layout. ",
                count: 12
            )
        )
    }

    static var previewWithMedia: Post {
        previewShell(
            id: "post-preview-media",
            text: "Photo check",
            media: [.previewImage]
        )
    }

    static var previewWithPoll: Post {
        previewShell(id: "post-preview-poll", text: "Vote?", poll: .preview)
    }

    static var previewQuote: Post {
        let inner = previewShell(
            id: "post-preview-quoted-inner",
            text: "Original post text",
            author: Post.previewPeerAuthor
        )
        return previewShell(
            id: "post-preview-quote",
            text: "Adding my take",
            quoteOf: Indirect(inner)
        )
    }

    static var previewRepost: Post {
        let inner = previewShell(
            id: "post-preview-reposted-inner",
            text: "Reposted content",
            author: Post.previewPeerAuthor
        )
        return previewShell(
            id: "post-preview-repost",
            text: "\u{200c}",
            repostOf: Indirect(inner)
        )
    }

    static var previewCW: Post {
        previewShell(
            id: "post-preview-cw",
            text: "Hidden body",
            contentWarning: "Spoilers"
        )
    }

    static var previewFeed: [Post] {
        [
            .previewText,
            .previewWithMedia,
            .previewWithPoll,
            .previewQuote,
            .previewRepost,
            .previewLong,
            .previewCW,
        ]
    }
}
