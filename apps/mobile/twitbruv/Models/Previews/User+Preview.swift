import Foundation

extension CurrentUser {
    static var preview: CurrentUser {
        CurrentUser(
            id: PreviewConst.userId,
            email: "preview@example.com",
            emailVerified: true,
            handle: PreviewConst.handle,
            displayName: "Preview User",
            bio: "Building twitbruv in preview mode.",
            location: "London",
            websiteUrl: "https://example.com",
            avatarUrl: nil,
            bannerUrl: nil,
            birthday: nil,
            isVerified: true,
            isBot: false,
            role: nil,
            locale: "en",
            timezone: "Europe/London",
            createdAt: Date()
        )
    }

    static var previewNeedsHandle: CurrentUser {
        CurrentUser(
            id: PreviewConst.userId,
            email: "preview@example.com",
            emailVerified: true,
            handle: nil,
            displayName: "New User",
            bio: nil,
            location: nil,
            websiteUrl: nil,
            avatarUrl: nil,
            bannerUrl: nil,
            birthday: nil,
            isVerified: false,
            isBot: false,
            role: nil,
            locale: nil,
            timezone: nil,
            createdAt: Date()
        )
    }
}

extension PublicUser {
    static var previewSelf: PublicUser {
        PublicUser(
            id: PreviewConst.userId,
            handle: PreviewConst.handle,
            displayName: "Preview User",
            avatarUrl: nil,
            bio: "Building twitbruv in preview mode.",
            location: "London",
            websiteUrl: "https://example.com",
            bannerUrl: nil,
            isVerified: true,
            isBot: false,
            role: nil,
            counts: PublicUser.Counts(followers: 120, following: 48, posts: 89),
            viewer: PublicUser.ViewerFlags(
                following: false,
                followedBy: false,
                blocking: false,
                muting: false
            ),
            createdAt: Date()
        )
    }

    static var previewPeer: PublicUser {
        PublicUser(
            id: PreviewConst.peerUserId,
            handle: PreviewConst.peerHandle,
            displayName: "Peer User",
            avatarUrl: nil,
            bio: "Neighbour account.",
            location: nil,
            websiteUrl: nil,
            bannerUrl: nil,
            isVerified: false,
            isBot: false,
            role: nil,
            timezone: nil,
            counts: PublicUser.Counts(followers: 42, following: 30, posts: 15),
            viewer: PublicUser.ViewerFlags(
                following: true,
                followedBy: false,
                blocking: false,
                muting: false
            ),
            createdAt: Date()
        )
    }
}

extension UserSummary {
    static var preview: UserSummary {
        UserSummary(
            id: PreviewConst.userId,
            handle: PreviewConst.handle,
            displayName: "Preview User",
            avatarUrl: nil,
            isVerified: true,
            bio: nil,
            role: nil
        )
    }

    static var previewPeer: UserSummary {
        UserSummary(
            id: PreviewConst.peerUserId,
            handle: PreviewConst.peerHandle,
            displayName: "Peer User",
            avatarUrl: nil,
            isVerified: false,
            bio: nil,
            role: nil
        )
    }

    static var previewList: [UserSummary] {
        [.preview, .previewPeer]
    }
}
