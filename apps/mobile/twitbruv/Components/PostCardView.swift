import SwiftUI

struct PostCardView: View {
    let post: Post
    var onLike: (() -> Void)?
    var onRepost: (() -> Void)?
    var onBookmark: (() -> Void)?
    var onReply: (() -> Void)?
    var onTapAuthor: (() -> Void)?
    var onMenuAction: ((PostMenuAction) -> Void)?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if post.repostOf != nil {
                Label("Reposted by @\(post.author.handle ?? "—")",
                      systemImage: "arrow.2.squarepath")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            let displayed = post.repostOf?.value ?? post

            if displayed.pinned == true {
                Label("Pinned", systemImage: "pin.fill")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
            }

            HStack(alignment: .top, spacing: 12) {
                Button {
                    onTapAuthor?()
                } label: {
                    AvatarView(
                        urlString: displayed.author.avatarUrl,
                        size: 44,
                        fallbackInitial: displayed.author.displayName ?? displayed.author.handle
                    )
                }
                .buttonStyle(.plain)

                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 4) {
                        Text(displayed.author.displayName ?? displayed.author.handle ?? "—")
                            .font(.subheadline.weight(.semibold))
                        if displayed.author.isVerified == true {
                            Image(systemName: "checkmark.seal.fill")
                                .font(.caption2)
                                .foregroundStyle(.tint)
                        }
                        if let handle = displayed.author.handle {
                            Text("@\(handle)")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                        Text("·")
                            .foregroundStyle(.secondary)
                        Text(displayed.createdAt.relativeShort)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                        Spacer()
                        Menu {
                            menu(for: displayed)
                        } label: {
                            Image(systemName: "ellipsis")
                                .foregroundStyle(.secondary)
                                .frame(width: 24, height: 24)
                                .contentShape(.rect)
                        }
                        .menuStyle(.button)
                        .menuOrder(.fixed)
                        .accessibilityLabel("Post options")
                    }

                    if let warning = displayed.contentWarning, !warning.isEmpty {
                        Text(warning)
                            .font(.footnote.weight(.semibold))
                            .padding(.vertical, 4)
                            .padding(.horizontal, 8)
                            .background(.yellow.opacity(0.15), in: .rect(cornerRadius: 6))
                    }

                    if !displayed.text.isEmpty {
                        Text(displayed.text)
                            .font(.body)
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
        .padding(.horizontal)
    }

    @ViewBuilder
    private func actionBar(displayed: Post) -> some View {
        HStack(spacing: 24) {
            actionButton(
                "bubble.left",
                count: displayed.counts.replies,
                tinted: false
            ) { onReply?() }
            actionButton(
                "arrow.2.squarepath",
                count: displayed.counts.reposts,
                tinted: displayed.viewer?.reposted == true
            ) { onRepost?() }
            actionButton(
                displayed.viewer?.liked == true ? "heart.fill" : "heart",
                count: displayed.counts.likes,
                tinted: displayed.viewer?.liked == true,
                tintColor: .red
            ) { onLike?() }
            actionButton(
                displayed.viewer?.bookmarked == true ? "bookmark.fill" : "bookmark",
                count: displayed.counts.bookmarks,
                tinted: displayed.viewer?.bookmarked == true,
                tintColor: .yellow
            ) { onBookmark?() }
            Spacer()
        }
        .font(.subheadline)
        .foregroundStyle(.secondary)
        .padding(.top, 4)
    }

    @ViewBuilder
    private func actionButton(
        _ icon: String,
        count: Int,
        tinted: Bool,
        tintColor: Color = .accentColor,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Image(systemName: icon)
                if count > 0 {
                    Text(formatCount(count))
                        .monospacedDigit()
                }
            }
            .foregroundStyle(tinted ? tintColor : .secondary)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(icon)")
    }

    @ViewBuilder
    private func menu(for displayed: Post) -> some View {
        Button {
            onMenuAction?(.copyLink(displayed.id))
        } label: {
            Label("Copy link", systemImage: "link")
        }
        if displayed.author.handle != nil {
            Button {
                onMenuAction?(.viewProfile(displayed.author.handle ?? ""))
            } label: {
                Label("View profile", systemImage: "person.crop.circle")
            }
        }
        Divider()
        Button(role: .destructive) {
            onMenuAction?(.report(displayed.id))
        } label: {
            Label("Report", systemImage: "flag")
        }
    }

    private func formatCount(_ n: Int) -> String {
        if n < 1000 { return "\(n)" }
        if n < 10_000 { return String(format: "%.1fk", Double(n) / 1000.0) }
        if n < 1_000_000 { return "\(n / 1000)k" }
        return String(format: "%.1fM", Double(n) / 1_000_000.0)
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
                    .font(.footnote.weight(.semibold))
                if let handle = post.author.handle {
                    Text("@\(handle)")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            if !post.text.isEmpty {
                Text(post.text)
                    .font(.footnote)
                    .lineLimit(4)
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay {
            RoundedRectangle(cornerRadius: 12)
                .strokeBorder(Color(.separator), lineWidth: 0.5)
        }
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
                            Color.accentColor.opacity(0.15)
                                .frame(width: proxy.size.width * pct)
                                .clipShape(.rect(cornerRadius: 8))
                        }
                        HStack {
                            Text(option.text)
                                .font(.callout)
                            Spacer()
                            Text("\(Int(pct * 100))%")
                                .font(.callout.monospacedDigit())
                                .foregroundStyle(.secondary)
                        }
                        .padding(.horizontal, 10)
                        .padding(.vertical, 8)
                    }
                    .frame(height: 36)
                    .overlay {
                        RoundedRectangle(cornerRadius: 8)
                            .strokeBorder(Color(.separator), lineWidth: 0.5)
                    }
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
            .font(.footnote)
            .foregroundStyle(.secondary)
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
                        default: Color(.tertiarySystemFill)
                        }
                    }
                    .frame(width: 88, height: 88)
                    .clipShape(.rect(cornerRadius: 8))
                }
                VStack(alignment: .leading, spacing: 4) {
                    if let title = card.title, !title.isEmpty {
                        Text(title).font(.callout.weight(.semibold)).lineLimit(2)
                    }
                    if let desc = card.description, !desc.isEmpty {
                        Text(desc).font(.footnote).foregroundStyle(.secondary).lineLimit(2)
                    }
                    if let site = card.siteName {
                        Text(site).font(.caption).foregroundStyle(.tertiary)
                    }
                }
                Spacer()
            }
            .padding(8)
            .overlay {
                RoundedRectangle(cornerRadius: 12)
                    .strokeBorder(Color(.separator), lineWidth: 0.5)
            }
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
