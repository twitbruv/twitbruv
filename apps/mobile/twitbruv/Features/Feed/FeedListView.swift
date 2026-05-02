import SwiftUI

struct FeedListView: View {
    @Environment(AppEnvironment.self) private var env
    @Bindable var loader: PagedLoader<Post, PostsResponse>
    var emptyTitle: String = "Nothing here yet"
    var emptyMessage: String? = "When there are new posts they'll show up here."
    var onSelectPost: (Post) -> Void
    var onSelectAuthor: (String) -> Void
    var onReply: ((Post) -> Void)? = nil
    var onReport: ((Post) -> Void)? = nil

    @State private var actions: PostActions?

    var body: some View {
        List {
            if let error = loader.error, loader.items.isEmpty {
                Section {
                    ErrorBanner(message: error.localizedDescription) {
                        Task { await loader.reload() }
                    }
                    .listRowSeparator(.hidden)
                }
            } else if loader.items.isEmpty && loader.didLoadOnce {
                Section {
                    #if DEBUG
                    EmptyStateView(
                        icon: "rectangle.stack",
                        title: emptyTitle,
                        message: emptyMessage,
                        actionTitle: "Seed local data",
                        action: {
                            Task {
                                let seeded = await env.devTools.seedLocalData()
                                if seeded { await loader.reload() }
                            }
                        }
                    )
                    .listRowSeparator(.hidden)
                    #else
                    EmptyStateView(
                        icon: "rectangle.stack",
                        title: emptyTitle,
                        message: emptyMessage,
                        actionTitle: nil,
                        action: nil
                    )
                    .listRowSeparator(.hidden)
                    #endif
                }
            } else {
                ForEach(loader.items) { post in
                    PostCardView(
                        post: post,
                        onLike: { Task { await actions?.toggleLike(post) } },
                        onRepost: { Task { await actions?.toggleRepost(post) } },
                        onBookmark: { Task { await actions?.toggleBookmark(post) } },
                        onReply: { onReply?(post) },
                        onTapAuthor: {
                            if let h = post.author.handle { onSelectAuthor(h) }
                        },
                        onMenuAction: { action in
                            handleMenu(action: action, post: post)
                        }
                    )
                    .contentShape(.rect)
                    .onTapGesture { onSelectPost(post) }
                    .listRowInsets(EdgeInsets())
                    .listRowSeparator(.visible)
                    .listRowBackground(Color.clear)
                }
                LoadMoreFooter(
                    hasMore: loader.nextCursor != nil,
                    isLoading: loader.isLoading
                ) {
                    await loader.loadMore()
                }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(Color.clear)
        .refreshable {
            await loader.reload()
        }
        .task {
            if actions == nil { actions = PostActions(api: env.api) }
            await loader.loadInitial()
        }
        .onReceive(
            NotificationCenter.default.publisher(for: .postMutated)
        ) { note in
            guard
                let id = note.userInfo?["id"] as? String,
                let box = note.userInfo?["mutation"] as? MutationBox
            else { return }
            if case .deleted = box.mutation {
                loader.remove(id: id)
                return
            }
            loader.patch(id: id) { post in box.mutation.apply(to: &post) }
        }
        .onReceive(
            NotificationCenter.default.publisher(for: .composedPostCreated)
        ) { note in
            if let post = note.object as? Post {
                loader.prepend(post)
            }
        }
    }

    private func handleMenu(action: PostMenuAction, post: Post) {
        switch action {
        case .copyLink(let id):
            UIPasteboard.general.string =
                Config.webBaseURL.appendingPathComponent(
                    "/@\(post.author.handle ?? "")/\(id)"
                ).absoluteString
        case .viewProfile(let handle):
            onSelectAuthor(handle)
        case .report(let id):
            if let onReport, let p = loader.items.first(where: { $0.id == id }) {
                onReport(p)
            }
        }
    }
}
