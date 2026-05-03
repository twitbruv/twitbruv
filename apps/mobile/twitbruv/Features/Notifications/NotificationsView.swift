import SwiftUI
import Observation

@Observable
@MainActor
final class NotificationsViewModel {
    let api: APIClient
    var items: [NotificationItem] = []
    var nextCursor: String?
    var unreadCount: Int = 0
    var isLoading = false
    var error: APIError?
    var didLoadOnce = false

    init(api: APIClient) { self.api = api }

    func reload() async {
        isLoading = true
        defer { isLoading = false }
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
}

struct NotificationsView: View {
    @Environment(AppEnvironment.self) private var env

    @State private var vm: NotificationsViewModel?
    @State private var path = NavigationPath()

    var body: some View {
        NavigationStack(path: $path) {
            Group {
                if let vm {
                    List {
                        if vm.items.isEmpty && vm.didLoadOnce {
                            EmptyStateView(
                                icon: "bell",
                                title: "No notifications yet"
                            )
                            .listRowSeparator(.hidden)
                        }
                        ForEach(vm.items) { item in
                            NotificationRow(item: item)
                                .listRowBackground(
                                    item.readAt == nil
                                        ? TBColor.glassCardTint
                                        : Color.clear
                                )
                                .contentShape(.rect)
                                .onTapGesture {
                                    if let id = item.post?.id {
                                        path.append(FeedRoute.thread(id: id))
                                    } else if let actor = item.actor?.handle {
                                        path.append(FeedRoute.profile(handle: actor))
                                    }
                                }
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
                    TBPageHeader(title: "Notifications") {
                        if let vm = vm, vm.unreadCount > 0 {
                            Button("Mark read") {
                                Task { await vm.markAllRead() }
                            }
                            .foregroundStyle(TBColor.accent)
                        }
                    }
                }
            }
            .navigationDestination(for: FeedRoute.self) { route in
                switch route {
                case .thread(let id): ThreadView(postId: id)
                case .profile(let h): ProfileView(handle: h, navigationPath: $path)
                case .compose(let p): ComposerView(mode: .reply(p))
                case .hashtag(let t): HashtagView(tag: t)
                }
            }
            .task {
                if vm == nil {
                    let new = NotificationsViewModel(api: env.api)
                    vm = new
                    await new.reload()
                }
            }
        }
        .tbOptionalTabBadge(vm?.unreadCount ?? 0)
    }
}

private struct NotificationRow: View {
    let item: NotificationItem

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: icon)
                .foregroundStyle(TBColor.accent)
                .frame(width: 28, height: 28)
            VStack(alignment: .leading, spacing: 4) {
                if let actor = item.actor {
                    HStack(spacing: 6) {
                        AvatarView(
                            urlString: actor.avatarUrl, size: 20,
                            fallbackInitial: actor.displayName ?? actor.handle
                        )
                        Text(actor.displayName ?? actor.handle ?? "—")
                            .font(TBTypography.meta.weight(.semibold))
                            .foregroundStyle(TBColor.textPrimary)
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
        .padding(.vertical, 4)
    }

    private var icon: String {
        switch item.type {
        case "like": return "heart.fill"
        case "repost": return "arrow.2.squarepath"
        case "follow": return "person.crop.circle.badge.plus"
        case "reply": return "bubble.left.fill"
        case "quote": return "quote.bubble.fill"
        case "mention": return "at"
        case "dm", "message": return "envelope.fill"
        default: return "bell.fill"
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
        default: return item.type
        }
    }
}
