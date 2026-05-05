import SwiftUI

struct PostCardView: View {
    let post: Post
    var onLike: (() -> Void)?
    var onRepost: (() -> Void)?
    var onQuote: (() -> Void)?
    var onBookmark: (() -> Void)?
    var onReply: (() -> Void)?
    var onTapAuthor: (() -> Void)?
    var onMenuAction: ((PostMenuAction) -> Void)?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if post.repostOf != nil {
                HStack(spacing: 12) {
                    HStack {
                        Spacer()
                        HeroIcon(name: "arrow-path-rounded-square-solid", size: 12)
                    }
                    .frame(width: TBLayout.hitTarget)
                    Text("@\(post.author.handle ?? "—") reposted")
                        .font(TBTypography.meta)
                }
                .foregroundStyle(TBColor.textTertiary)
            }

            let displayed = post.repostOf?.value ?? post

            if displayed.pinned == true {
                Label("Pinned", hero: "map-pin-solid")
                    .font(TBTypography.caption.weight(.semibold))
                    .foregroundStyle(TBColor.textTertiary)
            }

            HStack(alignment: .top, spacing: 12) {
                Button {
                    onTapAuthor?()
                } label: {
                    AvatarView(
                        urlString: displayed.author.avatarUrl,
                        size: TBLayout.hitTarget,
                        fallbackInitial: displayed.author.displayName ?? displayed.author.handle
                    )
                }
                .buttonStyle(.plain)

                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 4) {
                        Text(displayed.author.displayName ?? displayed.author.handle ?? "—")
                            .font(TBTypography.meta.weight(.semibold))
                            .foregroundStyle(TBColor.textPrimary)
                        if displayed.author.isVerified == true {
                            HeroIcon(name: "check-badge-solid", size: 13)
                                .foregroundStyle(TBColor.accent)
                        }
                        if let handle = displayed.author.handle {
                            Text("@\(handle)")
                                .font(TBTypography.meta)
                                .foregroundStyle(TBColor.textSecondary)
                        }
                        Text("·")
                            .foregroundStyle(TBColor.textSecondary)
                        Text(displayed.createdAt.relativeShort)
                            .font(TBTypography.meta)
                            .foregroundStyle(TBColor.textSecondary)
                        Spacer()
                        Menu {
                            menu(for: displayed)
                        } label: {
                            HeroIcon(name: "ellipsis-horizontal-solid", size: 18)
                                .foregroundStyle(TBColor.textTertiary)
                                .frame(width: 24, height: 24)
                                .contentShape(.rect)
                        }
                        .menuStyle(.button)
                        .menuOrder(.fixed)
                        .accessibilityLabel("Post options")
                    }

                    if let warning = displayed.contentWarning, !warning.isEmpty {
                        Text(warning)
                            .font(TBTypography.caption.weight(.semibold))
                            .foregroundStyle(TBColor.textPrimary)
                            .padding(.vertical, 4)
                            .padding(.horizontal, 8)
                            .background(TBColor.warnSubtle, in: RoundedRectangle(cornerRadius: TBLayout.radiusSM, style: .continuous))
                    }

                    if !displayed.text.isEmpty {
                        Text(displayed.text)
                            .font(TBTypography.meta)
                            .foregroundStyle(TBColor.textPrimary)
                            .textSelection(.enabled)
                    }

                    if let media = displayed.media, !media.isEmpty {
                        MediaCarouselView(media: media)
                    }

                    if let poll = displayed.poll {
                        PollCard(poll: poll)
                    }

                    if let cards = displayed.cards, !cards.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            ForEach(cards, id: \.url) { c in
                                UnfurlCardView(card: c)
                            }
                        }
                    }

                    if let quote = displayed.quoteOf?.value {
                        QuotedPostView(post: quote)
                    }

                    actionBar(displayed: displayed)
                }
            }
        }
        .padding(.vertical, 8)
        .padding(.horizontal, TBLayout.pagePadding)
    }

    @ViewBuilder
    private func actionBar(displayed: Post) -> some View {
        PostEngagementBar(
            post: displayed,
            onReply: { onReply?() },
            onRepost: { onRepost?() },
            onQuote: { onQuote?() },
            onLike: { onLike?() },
            onBookmark: { onBookmark?() }
        )
        .padding(.top, 10)
    }

    @ViewBuilder
    private func menu(for displayed: Post) -> some View {
        Button {
            onMenuAction?(.copyLink(displayed.id))
        } label: {
            Label("Copy link", hero: "link-solid")
        }
        if displayed.author.handle != nil {
            Button {
                onMenuAction?(.viewProfile(displayed.author.handle ?? ""))
            } label: {
                Label("View profile", hero: "user-circle-solid")
            }
        }
        Divider()
        Button(role: .destructive) {
            onMenuAction?(.report(displayed.id))
        } label: {
            Label("Report", hero: "flag-solid")
        }
    }
}

enum PostMenuAction {
    case copyLink(String)
    case viewProfile(String)
    case report(String)
}

private struct QuotedPostView: View {
    let post: Post
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                AvatarView(
                    urlString: post.author.avatarUrl,
                    size: 20,
                    fallbackInitial: post.author.displayName ?? post.author.handle
                )
                Text(post.author.displayName ?? post.author.handle ?? "—")
                    .font(TBTypography.caption.weight(.semibold))
                    .foregroundStyle(TBColor.textPrimary)
                if let handle = post.author.handle {
                    Text("@\(handle)")
                        .font(TBTypography.caption)
                        .foregroundStyle(TBColor.textSecondary)
                }
            }
            if !post.text.isEmpty {
                Text(post.text)
                    .font(TBTypography.caption)
                    .foregroundStyle(TBColor.textPrimary)
                    .lineLimit(4)
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .tbGlass(
            .card,
            in: RoundedRectangle(cornerRadius: TBLayout.radiusGlassCard, style: .continuous),
            shadow: false
        )
    }
}

private struct PollCard: View {
    let poll: Poll
    var onVote: ((String) -> Void)?

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(poll.options) { option in
                let pct = percent(for: option)
                Button {
                    if !poll.closed { onVote?(option.id) }
                } label: {
                    ZStack(alignment: .leading) {
                        GeometryReader { proxy in
                            TBColor.accent.opacity(0.15)
                                .frame(width: proxy.size.width * pct)
                                .clipShape(RoundedRectangle(cornerRadius: TBLayout.radiusMD, style: .continuous))
                        }
                        HStack {
                            Text(option.text)
                                .font(TBTypography.bodySecondary)
                                .foregroundStyle(TBColor.textPrimary)
                            Spacer()
                            Text("\(Int(pct * 100))%")
                                .font(TBTypography.bodySecondary.monospacedDigit())
                                .foregroundStyle(TBColor.textSecondary)
                        }
                        .padding(.horizontal, 10)
                        .padding(.vertical, 8)
                    }
                    .frame(height: 36)
                    .tbGlass(
                        .field,
                        in: RoundedRectangle(cornerRadius: TBLayout.radiusMD, style: .continuous),
                        interactive: !poll.closed,
                        shadow: false
                    )
                }
                .buttonStyle(.plain)
                .disabled(poll.closed)
            }
            HStack(spacing: 6) {
                Text("\(poll.totalVotes) votes")
                if poll.closed {
                    Text("· closed")
                } else {
                    Text("· closes \(poll.closesAt.relativeShort)")
                }
            }
            .font(TBTypography.caption)
            .foregroundStyle(TBColor.textSecondary)
        }
    }

    private func percent(for option: Poll.Option) -> CGFloat {
        guard poll.totalVotes > 0 else { return 0 }
        return CGFloat(option.voteCount) / CGFloat(poll.totalVotes)
    }
}

private struct UnfurlCardView: View {
    let card: UnfurlCard

    var body: some View {
        Link(destination: URL(string: card.url) ?? Config.webBaseURL) {
            HStack(spacing: 10) {
                if let imageStr = card.imageUrl, let url = URL(string: imageStr) {
                    AsyncImage(url: url) { phase in
                        switch phase {
                        case .success(let img): img.resizable().scaledToFill()
                        default: TBColor.base2
                        }
                    }
                    .frame(width: 88, height: 88)
                    .clipShape(RoundedRectangle(cornerRadius: TBLayout.radiusMD, style: .continuous))
                }
                VStack(alignment: .leading, spacing: 4) {
                    if let title = card.title, !title.isEmpty {
                        Text(title)
                            .font(TBTypography.bodySecondary.weight(.semibold))
                            .foregroundStyle(TBColor.textPrimary)
                            .lineLimit(2)
                    }
                    if let desc = card.description, !desc.isEmpty {
                        Text(desc)
                            .font(TBTypography.caption)
                            .foregroundStyle(TBColor.textSecondary)
                            .lineLimit(2)
                    }
                    if let site = card.siteName {
                        Text(site)
                            .font(TBTypography.caption)
                            .foregroundStyle(TBColor.textTertiary)
                    }
                }
                Spacer()
            }
            .padding(8)
            .tbGlass(
                .card,
                in: RoundedRectangle(cornerRadius: TBLayout.radiusGlassCard, style: .continuous),
                interactive: true,
                shadow: false
            )
        }
        .buttonStyle(.plain)
    }
}

extension Date {
    var relativeShort: String {
        let now = Date()
        let delta = max(0, now.timeIntervalSince(self))
        if delta < 60 { return "\(Int(delta))s" }
        if delta < 3600 { return "\(Int(delta / 60))m" }
        if delta < 86_400 { return "\(Int(delta / 3600))h" }
        if delta < 86_400 * 7 { return "\(Int(delta / 86_400))d" }
        let f = DateFormatter()
        f.dateFormat = "MMM d"
        return f.string(from: self)
    }
}
