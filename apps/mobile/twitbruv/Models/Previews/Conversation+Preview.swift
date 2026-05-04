import Foundation

extension Message {
    static var previewInbound: Message {
        Message(
            id: "msg-preview-1",
            conversationId: PreviewConst.conversationId,
            senderId: PreviewConst.peerUserId,
            sender: .previewPeer,
            text: "Hey! Preview message.",
            media: nil,
            createdAt: Date().addingTimeInterval(-3600),
            editedAt: nil,
            deletedAt: nil,
            replyToId: nil,
            replyTo: nil,
            reactions: nil
        )
    }

    static var previewOutbound: Message {
        Message(
            id: "msg-preview-2",
            conversationId: PreviewConst.conversationId,
            senderId: PreviewConst.userId,
            sender: .preview,
            text: "Reply in preview.",
            media: nil,
            createdAt: Date(),
            editedAt: nil,
            deletedAt: nil,
            replyToId: nil,
            replyTo: nil,
            reactions: [
                Reaction(emoji: "👍", count: 1, byMe: false, userIds: nil),
            ]
        )
    }
}

extension Conversation {
    static var previewDirect: Conversation {
        Conversation(
            id: PreviewConst.conversationId,
            kind: "direct",
            name: nil,
            members: [.previewPeer],
            lastMessage: .previewOutbound,
            lastMessageAt: Date(),
            unreadCount: 1,
            requestState: nil,
            isGroup: false,
            avatarUrl: nil,
            createdAt: Date()
        )
    }
}
