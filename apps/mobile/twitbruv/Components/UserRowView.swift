import SwiftUI

struct UserRowView: View {
    let user: UserSummary
    var trailing: AnyView?

    init(user: UserSummary, @ViewBuilder trailing: () -> some View = { EmptyView() }) {
        self.user = user
        self.trailing = AnyView(trailing())
    }

    var body: some View {
        HStack(spacing: 12) {
            AvatarView(
                urlString: user.avatarUrl,
                size: 44,
                fallbackInitial: user.displayName ?? user.handle
            )
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 4) {
                    Text(user.displayName ?? user.handle ?? "—")
                        .font(.body.weight(.semibold))
                    if user.isVerified == true {
                        Image(systemName: "checkmark.seal.fill")
                            .font(.caption)
                            .foregroundStyle(.tint)
                    }
                }
                if let handle = user.handle {
                    Text("@\(handle)")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                }
                if let bio = user.bio, !bio.isEmpty {
                    Text(bio)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }
            }
            Spacer()
            trailing
        }
        .contentShape(.rect)
    }
}

extension UserSummary {
    init(public user: PublicUser) {
        self.init(
            id: user.id,
            handle: user.handle,
            displayName: user.displayName,
            avatarUrl: user.avatarUrl,
            isVerified: user.isVerified,
            bio: user.bio,
            role: user.role
        )
    }

    init(post author: Post.PostAuthor) {
        self.init(
            id: author.id,
            handle: author.handle,
            displayName: author.displayName,
            avatarUrl: author.avatarUrl,
            isVerified: author.isVerified,
            bio: nil,
            role: author.role
        )
    }
}
