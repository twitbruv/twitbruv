import SwiftUI
import Observation

private let GROUPING_THRESHOLD = 3

@Observable
@MainActor
final class NotificationsViewModel {
    let api: APIClient
    let actions: PostActions
    var items: [NotificationItem] = []
    var nextCursor: String?
    var unreadCount: Int = 0
    var isLoading = false
    var error: APIError?
    var didLoadOnce = false

    init(api: APIClient) {
        self.api = api
        self.actions = PostActions(api: api)
    }

    func reload() async {
        isLoading = true
        defer { isLoading = false }
        error = nil
        do {
            let response: NotificationsResponse = try await api.get(
                API.Notifications.list(cursor: nil, unreadOnly: false)
            )
            items = response.notifications
            nextCursor = response.nextCursor
            didLoadOnce = true
            await refreshUnread()
        } catch let e as APIError { self.error = e } catch { self.error = .invalidResponse }
    }

    func loadMore() async {
        guard let cursor = nextCursor, !isLoading else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            let response: NotificationsResponse = try await api.get(
                API.Notifications.list(cursor: cursor, unreadOnly: false)
            )
            items.append(contentsOf: response.notifications)
            nextCursor = response.nextCursor
        } catch {}
    }

    func refreshUnread() async {
        do {
            let response: NotificationsUnreadCountResponse = try await api.get(
                API.Notifications.unreadCount()
            )
            unreadCount = response.value
        } catch {}
    }

    func markAllRead() async {
        do {
            try await api.sendVoid(
                API.Notifications.markRead(),
                body: MarkReadBody(ids: nil, all: true)
            )
            for idx in items.indices where items[idx].readAt == nil {
                items[idx].readAt = .now
            }
            unreadCount = 0
        } catch {}
    }

    func applyMutation(_ mutation: PostMutation, to postId: String) {
        for idx in items.indices {
            guard var post = items[idx].post, post.id == postId else { continue }
            mutation.apply(to: &post)
            items[idx].post = post
        }
    }
}

private enum GroupedNotification: Identifiable {
    case single(NotificationItem)
    case groupedLikes(items: [NotificationItem], target: Post)
    case groupedFollows(items: [NotificationItem])
    case reply(NotificationItem)
    case mention(NotificationItem)

    var id: String {
        switch self {
        case .single(let i): return i.id
        case .reply(let i): return "reply-\(i.id)"
        case .mention(let i): return "mention-\(i.id)"
        case .groupedLikes(let items, let target):
            return "likes-\(target.id)-\(items.first?.id ?? "")"
        case .groupedFollows(let items):
            return "follows-\(items.first?.id ?? "")"
        }
    }

    var hasUnread: Bool {
        switch self {
        case .single(let i), .reply(let i), .mention(let i):
            return i.readAt == nil
        case .groupedLikes(let items, _), .groupedFollows(let items):
            return items.contains { $0.readAt == nil }
        }
    }
}

private func groupNotifications(_ items: [NotificationItem]) -> [GroupedNotification] {
    var likesByEntity: [String: [NotificationItem]] = [:]
    var follows: [NotificationItem] = []
    var others: [(Int, GroupedNotification)] = []

    for (i, item) in items.enumerated() {
        if item.type == "like", let postId = item.post?.id {
            likesByEntity[postId, default: []].append(item)
        } else if item.type == "follow" {
            follows.append(item)
        } else if item.type == "reply" || item.type == "article_reply" {
            others.append((i, .reply(item)))
        } else if item.type == "mention" {
            others.append((i, .mention(item)))
        } else {
            others.append((i, .single(item)))
        }
    }

    var result: [(Int, GroupedNotification)] = others

    for (_, likeItems) in likesByEntity {
        guard let first = likeItems.first,
              let firstIndex = items.firstIndex(of: first) else { continue }
        if likeItems.count >= GROUPING_THRESHOLD, let target = first.post {
            result.append((firstIndex, .groupedLikes(items: likeItems, target: target)))
        } else {
            for item in likeItems {
                if let idx = items.firstIndex(of: item) {
                    result.append((idx, .single(item)))
                }
            }
        }
    }

    if follows.count >= GROUPING_THRESHOLD {
        let firstIndex = items.firstIndex(of: follows[0]) ?? 0
        result.append((firstIndex, .groupedFollows(items: follows)))
    } else {
        for item in follows {
            if let idx = items.firstIndex(of: item) {
                result.append((idx, .single(item)))
            }
        }
    }

    result.sort { $0.0 < $1.0 }
    return result.map { $0.1 }
}

private struct NotificationActions {
    let openPost: (String) -> Void
    let openProfile: (String) -> Void
    let reply: (Post) -> Void
    let quote: (Post) -> Void
    let like: (Post) -> Void
    let repost: (Post) -> Void
    let bookmark: (Post) -> Void
}

struct NotificationsView: View {
    @Environment(AppEnvironment.self) private var env

    @State private var vm: NotificationsViewModel?
    @State private var path = NavigationPath()

    var body: some View {
        NavigationStack(path: $path) {
            Group {
                if let vm {
                    content(vm: vm)
                } else {
                    ProgressView()
                        .tint(TBColor.accent)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .background(Color.clear)
                }
            }
            .navigationTitle("")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    Text("Notifications")
                        .font(TBTypography.navLabel.weight(.semibold))
                        .foregroundStyle(TBColor.textPrimary)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    if let vm = vm, vm.unreadCount > 0 {
                        Button("Mark read") {
                            Task { await vm.markAllRead() }
                        }
                        .foregroundStyle(TBColor.accent)
                    }
                }
            }
            .navigationDestination(for: FeedRoute.self) { route in
                switch route {
                case .thread(let id): ThreadView(postId: id)
                case .profile(let h): ProfileView(handle: h, navigationPath: $path)
                case .compose(let p): ComposerView(mode: .reply(p))
                case .quote(let target): ComposerView(mode: .quote(target))
                case .hashtag(let t): HashtagView(tag: t)
                case .search(let q): SearchStackContent(path: $path, initialQuery: q)
                }
            }
            .task {
                if vm == nil {
                    let new = NotificationsViewModel(api: env.api)
                    vm = new
                    await new.reload()
                }
            }
            .onReceive(
                NotificationCenter.default.publisher(for: .postMutated)
            ) { note in
                guard
                    let id = note.userInfo?["id"] as? String,
                    let box = note.userInfo?["mutation"] as? MutationBox
                else { return }
                vm?.applyMutation(box.mutation, to: id)
            }
        }
        .tbOptionalTabBadge(vm?.unreadCount ?? 0)
    }

    @ViewBuilder
    private func content(vm: NotificationsViewModel) -> some View {
        let actions = NotificationActions(
            openPost: { id in path.append(FeedRoute.thread(id: id)) },
            openProfile: { handle in path.append(FeedRoute.profile(handle: handle)) },
            reply: { post in path.append(FeedRoute.compose(replyTo: post)) },
            quote: { post in path.append(FeedRoute.quote(target: post)) },
            like: { post in Task { await vm.actions.toggleLike(post) } },
            repost: { post in Task { await vm.actions.toggleRepost(post) } },
            bookmark: { post in Task { await vm.actions.toggleBookmark(post) } }
        )
        let groups = groupNotifications(vm.items)

        List {
            if let err = vm.error {
                ErrorBanner(message: err.localizedDescription) {
                    Task { await vm.reload() }
                }
                .listRowSeparator(.hidden)
            }
            if vm.items.isEmpty && vm.didLoadOnce {
                EmptyStateView(
                    icon: "bell-solid",
                    title: "No notifications yet"
                )
                .listRowSeparator(.hidden)
            }
            ForEach(groups) { group in
                groupRow(group: group, actions: actions)
                    .listRowBackground(
                        group.hasUnread ? TBColor.glassCardTint : Color.clear
                    )
                    .listRowInsets(EdgeInsets())
                    .listRowSeparator(.hidden)
            }
            LoadMoreFooter(
                hasMore: vm.nextCursor != nil,
                isLoading: vm.isLoading
            ) { await vm.loadMore() }
        }
        .listRowSpacing(TBLayout.feedListRowSpacing)
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(Color.clear)
        .refreshable { await vm.reload() }
        .tbReadableColumn()
    }

    @ViewBuilder
    private func groupRow(
        group: GroupedNotification,
        actions: NotificationActions
    ) -> some View {
        switch group {
        case .single(let item):
            NotificationRow(item: item, actions: actions)
        case .groupedLikes(let items, let target):
            GroupedLikeRow(items: items, target: target, actions: actions)
        case .groupedFollows(let items):
            GroupedFollowRow(items: items, actions: actions)
        case .reply(let item):
            ReplyRow(item: item, actions: actions)
        case .mention(let item):
            MentionRow(item: item, actions: actions)
        }
    }
}

// MARK: - Row primitives

private struct ActorHeader: View {
    let actor: UserSummary?
    let onSelectProfile: (String) -> Void
    var trailing: AnyView? = nil

    var body: some View {
        HStack(spacing: 6) {
            if let actor, let handle = actor.handle {
                Button { onSelectProfile(handle) } label: {
                    AvatarView(
                        urlString: actor.avatarUrl, size: 20,
                        fallbackInitial: actor.displayName ?? handle
                    )
                }
                .buttonStyle(.plain)
                Button { onSelectProfile(handle) } label: {
                    HStack(spacing: 4) {
                        Text(actor.displayName ?? handle)
                            .font(TBTypography.meta.weight(.semibold))
                            .foregroundStyle(TBColor.textPrimary)
                        if actor.isVerified == true {
                            HeroIcon(name: "check-badge-solid", size: 13)
                                .foregroundStyle(TBColor.accent)
                        }
                    }
                }
                .buttonStyle(.plain)
            } else if let actor {
                AvatarView(
                    urlString: actor.avatarUrl, size: 20,
                    fallbackInitial: actor.displayName
                )
                HStack(spacing: 4) {
                    Text(actor.displayName ?? "—")
                        .font(TBTypography.meta.weight(.semibold))
                        .foregroundStyle(TBColor.textPrimary)
                    if actor.isVerified == true {
                        HeroIcon(name: "check-badge-solid", size: 13)
                            .foregroundStyle(TBColor.accent)
                    }
                }
            }
            if let trailing { trailing }
        }
    }
}

private struct AvatarRow: View {
    let items: [NotificationItem]
    let onSelectProfile: (String) -> Void

    var body: some View {
        HStack(spacing: 4) {
            ForEach(items.prefix(8), id: \.id) { item in
                if let handle = item.actor?.handle {
                    Button { onSelectProfile(handle) } label: {
                        AvatarView(
                            urlString: item.actor?.avatarUrl,
                            size: 24,
                            fallbackInitial: item.actor?.displayName ?? handle
                        )
                    }
                    .buttonStyle(.plain)
                } else {
                    AvatarView(
                        urlString: item.actor?.avatarUrl,
                        size: 24,
                        fallbackInitial: item.actor?.displayName
                    )
                }
            }
        }
    }
}

// MARK: - Default single notification

private struct NotificationRow: View {
    let item: NotificationItem
    let actions: NotificationActions

    var body: some View {
        TappableRow(action: tapAction) {
            HStack(alignment: .top, spacing: 10) {
                HeroIcon(name: icon, size: 20)
                    .foregroundStyle(iconColor)
                    .frame(width: 28, height: 28)
                VStack(alignment: .leading, spacing: 4) {
                    if let actor = item.actor {
                        HStack(spacing: 6) {
                            ActorHeader(actor: actor, onSelectProfile: actions.openProfile)
                            Text(verb)
                                .font(TBTypography.meta)
                                .foregroundStyle(TBColor.textSecondary)
                        }
                    } else {
                        Text(verb)
                            .font(TBTypography.meta)
                            .foregroundStyle(TBColor.textPrimary)
                    }
                    if let post = item.post, !post.text.isEmpty {
                        Text(post.text)
                            .font(TBTypography.caption)
                            .lineLimit(2)
                            .foregroundStyle(TBColor.textSecondary)
                    }
                    Text(item.createdAt.relativeShort)
                        .font(TBTypography.micro)
                        .foregroundStyle(TBColor.textTertiary)
                }
            }
            .padding(.horizontal, TBLayout.pagePadding)
            .padding(.vertical, 8)
        }
    }

    private func tapAction() {
        if let id = item.post?.id {
            actions.openPost(id)
        } else if let handle = item.actor?.handle {
            actions.openProfile(handle)
        }
    }

    private var icon: String {
        switch item.type {
        case "like": return "heart-solid"
        case "repost": return "arrow-path-rounded-square-solid"
        case "follow": return "user-plus-solid"
        case "reply": return "chat-bubble-left-solid"
        case "quote": return "chat-bubble-bottom-center-text-solid"
        case "mention": return "at-symbol-solid"
        case "dm", "message": return "envelope-solid"
        case "article_reply": return "chat-bubble-left-solid"
        default: return "bell-solid"
        }
    }

    private var iconColor: Color {
        switch item.type {
        case "like": return TBColor.like
        default: return TBColor.accent
        }
    }

    private var verb: String {
        switch item.type {
        case "like": return "liked your post"
        case "repost": return "reposted you"
        case "follow": return "followed you"
        case "reply": return "replied"
        case "quote": return "quoted you"
        case "mention": return "mentioned you"
        case "dm", "message": return "sent a message"
        case "article_reply": return "replied to your article"
        default: return item.type
        }
    }
}

// MARK: - Grouped likes

private struct GroupedLikeRow: View {
    let items: [NotificationItem]
    let target: Post
    let actions: NotificationActions

    var body: some View {
        let lead = items[0].actor
        let othersCount = items.count - 1
        TappableRow(action: { actions.openPost(target.id) }) {
            VStack(alignment: .leading, spacing: 6) {
                HStack(alignment: .center, spacing: 10) {
                    HeroIcon(name: "heart-solid", size: 20)
                        .foregroundStyle(TBColor.like)
                        .frame(width: 28, height: 28)
                    AvatarRow(items: items, onSelectProfile: actions.openProfile)
                }
                VStack(alignment: .leading, spacing: 4) {
                    Text(
                        "\(Text(leadName(lead)).fontWeight(.semibold).foregroundColor(TBColor.textPrimary)) and \(othersCount) other\(othersCount == 1 ? "" : "s") liked your post"
                    )
                    .font(TBTypography.meta)
                    .foregroundColor(TBColor.textSecondary)
                    if !target.text.isEmpty {
                        Text(target.text)
                            .font(TBTypography.caption)
                            .lineLimit(2)
                            .foregroundStyle(TBColor.textSecondary)
                    }
                    Text(items[0].createdAt.relativeShort)
                        .font(TBTypography.micro)
                        .foregroundStyle(TBColor.textTertiary)
                }
                .padding(.leading, 38)
            }
            .padding(.horizontal, TBLayout.pagePadding)
            .padding(.vertical, 8)
        }
    }

    private func leadName(_ actor: UserSummary?) -> String {
        actor?.displayName ?? actor?.handle ?? "someone"
    }
}

// MARK: - Grouped follows

private struct GroupedFollowRow: View {
    let items: [NotificationItem]
    let actions: NotificationActions

    var body: some View {
        let lead = items[0].actor
        let othersCount = items.count - 1
        TappableRow(action: { if let h = lead?.handle { actions.openProfile(h) } }) {
            VStack(alignment: .leading, spacing: 6) {
                HStack(alignment: .center, spacing: 10) {
                    HeroIcon(name: "user-plus-solid", size: 20)
                        .foregroundStyle(TBColor.accent)
                        .frame(width: 28, height: 28)
                    AvatarRow(items: items, onSelectProfile: actions.openProfile)
                }
                VStack(alignment: .leading, spacing: 4) {
                    Text(
                        "\(Text(lead?.displayName ?? lead?.handle ?? "someone").fontWeight(.semibold).foregroundColor(TBColor.textPrimary)) and \(othersCount) other\(othersCount == 1 ? "" : "s") followed you"
                    )
                    .font(TBTypography.meta)
                    .foregroundColor(TBColor.textSecondary)
                    .multilineTextAlignment(.leading)
                    Text(items[0].createdAt.relativeShort)
                        .font(TBTypography.micro)
                        .foregroundStyle(TBColor.textTertiary)
                }
                .padding(.leading, 38)
            }
            .padding(.horizontal, TBLayout.pagePadding)
            .padding(.vertical, 8)
        }
    }
}

// MARK: - Reply row

private struct ReplyRow: View {
    let item: NotificationItem
    let actions: NotificationActions

    var body: some View {
        let target = item.post
        TappableRow(action: { if let id = target?.id { actions.openPost(id) } }) {
            HStack(alignment: .top, spacing: 10) {
                HeroIcon(name: "chat-bubble-left-solid", size: 20)
                    .foregroundStyle(TBColor.accent)
                    .frame(width: 28, height: 28)
                VStack(alignment: .leading, spacing: 6) {
                    ActorHeader(actor: item.actor, onSelectProfile: actions.openProfile)
                    if let parentHandle = target?.replyParent?.value.author.handle {
                        Text(
                            "Replying to \(Text("@\(parentHandle)").foregroundColor(TBColor.accent))"
                        )
                        .font(TBTypography.caption)
                        .foregroundColor(TBColor.textSecondary)
                    }
                    if let target, !target.text.isEmpty {
                        Text(target.text)
                            .font(TBTypography.meta)
                            .foregroundStyle(TBColor.textPrimary)
                    }
                    if let target {
                        PostEngagementBar(
                            post: target,
                            onReply: { actions.reply(target) },
                            onRepost: { actions.repost(target) },
                            onQuote: { actions.quote(target) },
                            onLike: { actions.like(target) },
                            onBookmark: { actions.bookmark(target) }
                        )
                        .padding(.top, 4)
                    }
                    Text(item.createdAt.relativeShort)
                        .font(TBTypography.micro)
                        .foregroundStyle(TBColor.textTertiary)
                }
            }
            .padding(.horizontal, TBLayout.pagePadding)
            .padding(.vertical, 8)
        }
    }
}

// MARK: - Mention row

private struct MentionRow: View {
    let item: NotificationItem
    let actions: NotificationActions

    var body: some View {
        let target = item.post
        TappableRow(action: { if let id = target?.id { actions.openPost(id) } }) {
            HStack(alignment: .top, spacing: 10) {
                HeroIcon(name: "at-symbol-solid", size: 20)
                    .foregroundStyle(TBColor.accent)
                    .frame(width: 28, height: 28)
                VStack(alignment: .leading, spacing: 6) {
                    ActorHeader(actor: item.actor, onSelectProfile: actions.openProfile)
                    if let target, !target.text.isEmpty {
                        Text(target.text)
                            .font(TBTypography.meta)
                            .foregroundStyle(TBColor.textPrimary)
                    }
                    if let target {
                        PostEngagementBar(
                            post: target,
                            onReply: { actions.reply(target) },
                            onRepost: { actions.repost(target) },
                            onQuote: { actions.quote(target) },
                            onLike: { actions.like(target) },
                            onBookmark: { actions.bookmark(target) }
                        )
                        .padding(.top, 4)
                    }
                    Text(item.createdAt.relativeShort)
                        .font(TBTypography.micro)
                        .foregroundStyle(TBColor.textTertiary)
                }
            }
            .padding(.horizontal, TBLayout.pagePadding)
            .padding(.vertical, 8)
        }
    }
}

#if DEBUG
#Preview("Light") {
    NotificationsView()
        .tbPreview(authState: .signedIn(user: .preview), colorScheme: .light)
}

#Preview("Dark") {
    NotificationsView()
        .tbPreview(authState: .signedIn(user: .preview), colorScheme: .dark)
}
#endif
