import SwiftUI

/// Avatar for a DM list row / chat header.
///
/// 1:1 conversations show the other member's avatar (the API filters out the
/// current user from `members`). Groups show two members stacked, with the
/// front avatar surrounded by a base-1 ring so it visibly separates from the
/// avatar peeking out behind it.
struct ConversationAvatar: View {
    let conversation: Conversation
    var size: CGFloat = 44

    var body: some View {
        if let url = conversation.avatarUrl, !url.isEmpty {
            AvatarView(
                urlString: url,
                size: size,
                fallbackInitial: conversation.name
            )
        } else if conversation.isGroup,
                  let members = conversation.members,
                  members.count >= 2 {
            GroupAvatarStack(
                members: Array(members.prefix(2)),
                size: size,
                groupFallback: conversation.name
            )
        } else {
            let m = conversation.members?.first
            AvatarView(
                urlString: m?.avatarUrl,
                size: size,
                fallbackInitial: m?.displayName ?? m?.handle ?? conversation.name
            )
        }
    }
}

private struct GroupAvatarStack: View {
    let members: [UserSummary]
    let size: CGFloat
    let groupFallback: String?

    var body: some View {
        let inner = size * 0.62
        let ringSize: CGFloat = 4
        let offset = max(0, (size - inner - ringSize) / 2)

        ZStack {
            // Back avatar (bottom-right). Drawn first, so the front overlaps it.
            if members.count > 1 {
                let m = members[1]
                AvatarView(
                    urlString: m.avatarUrl,
                    size: inner,
                    fallbackInitial: m.displayName ?? m.handle ?? groupFallback
                )
                .offset(x: offset, y: offset)
            }
            // Front avatar (top-left) with a base-1 ring so it visually
            // separates from whatever is behind it.
            let m = members[0]
            AvatarView(
                urlString: m.avatarUrl,
                size: inner,
                fallbackInitial: m.displayName ?? m.handle ?? groupFallback
            )
            .padding(2)
            .background(Circle().fill(TBColor.base1))
            .offset(x: -offset, y: -offset)
        }
        .frame(width: size, height: size)
    }
}
