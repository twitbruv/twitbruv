import SwiftUI

struct UserRowView<Trailing: View>: View {
    let user: UserSummary
    let trailing: () -> Trailing

    init(user: UserSummary, @ViewBuilder trailing: @escaping () -> Trailing) {
        self.user = user
        self.trailing = trailing
    }

    var body: some View {
        HStack(spacing: 12) {
            AvatarView(
                urlString: user.avatarUrl,
                size: TBLayout.hitTarget,
                fallbackInitial: user.displayName ?? user.handle
            )
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 4) {
                    Text(user.displayName ?? user.handle ?? "—")
                        .font(TBTypography.body.weight(.semibold))
                        .foregroundStyle(TBColor.textPrimary)
                    if user.isVerified == true {
                        Image(systemName: "checkmark.seal.fill")
                            .font(.caption)
                            .foregroundStyle(TBColor.accent)
                    }
                }
                if let handle = user.handle {
                    Text("@\(handle)")
                        .font(TBTypography.bodySecondary)
                        .foregroundStyle(TBColor.textSecondary)
                }
                if let bio = user.bio, !bio.isEmpty {
                    Text(bio)
                        .font(TBTypography.caption)
                        .foregroundStyle(TBColor.textSecondary)
                        .lineLimit(2)
                }
            }
            Spacer()
            trailing()
        }
        .contentShape(.rect)
    }
}

extension UserRowView where Trailing == EmptyView {
    init(user: UserSummary) {
        self.init(user: user) { EmptyView() }
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
