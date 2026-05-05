import SwiftUI

struct PostEngagementBar: View {
    let post: Post
    var onReply: () -> Void
    var onRepost: () -> Void
    var onQuote: () -> Void
    var onLike: () -> Void
    var onBookmark: () -> Void

    var body: some View {
        HStack(spacing: 0) {
            TBPostActionButton(
                icon: "chat-bubble-left-outline",
                count: post.counts.replies,
                isActive: false,
                activeColor: TBColor.accent,
                action: onReply
            )
            .frame(maxWidth: .infinity, alignment: .leading)

            Menu {
                Button {
                    onRepost()
                } label: {
                    Label(
                        post.viewer?.reposted == true ? "Undo repost" : "Repost",
                        hero: "arrow-path-rounded-square-solid"
                    )
                }
                Button {
                    onQuote()
                } label: {
                    Label("Quote post", hero: "chat-bubble-bottom-center-text-solid")
                }
            } label: {
                HStack(spacing: 6) {
                    HeroIcon(
                        name: post.viewer?.reposted == true
                            ? "arrow-path-rounded-square-solid"
                            : "arrow-path-rounded-square-outline",
                        size: 16
                    )
                    let total = post.counts.reposts + post.counts.quotes
                    if total > 0 {
                        Text(TBPostActionButton.formatCount(total))
                            .monospacedDigit()
                    }
                }
                .font(TBTypography.meta)
                .foregroundStyle(
                    post.viewer?.reposted == true
                        ? TBColor.accent
                        : TBColor.textTertiary
                )
                .contentShape(.rect)
            }
            .menuStyle(.button)
            .buttonStyle(.plain)
            .frame(maxWidth: .infinity, alignment: .leading)

            TBPostActionButton(
                icon: post.viewer?.liked == true ? "heart-solid" : "heart-outline",
                count: post.counts.likes,
                isActive: post.viewer?.liked == true,
                activeColor: TBColor.like,
                action: onLike
            )
            .frame(maxWidth: .infinity, alignment: .leading)

            TBPostActionButton(
                icon: post.viewer?.bookmarked == true ? "bookmark-solid" : "bookmark-outline",
                count: post.counts.bookmarks,
                isActive: post.viewer?.bookmarked == true,
                activeColor: TBColor.accent,
                action: onBookmark
            )
        }
    }
}
