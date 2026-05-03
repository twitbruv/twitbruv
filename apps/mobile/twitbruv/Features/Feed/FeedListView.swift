import SwiftUI

struct FeedListView<TopInset: View>: View {
    @Environment(AppEnvironment.self) private var env
    @Bindable var loader: PagedLoader<Post, PostsResponse>
    var emptyTitle: String = "Nothing here yet"
    var emptyMessage: String? = "When there are new posts they'll show up here."
    var onSelectPost: (Post) -> Void
    var onSelectAuthor: (String) -> Void
    var onReply: ((Post) -> Void)? = nil
    var onReport: ((Post) -> Void)? = nil
    var scrollCollapsesTopInset: Bool = false
    var collapseInsetResetToken: AnyHashable? = nil
    @ViewBuilder var topSafeAreaInset: () -> TopInset

    @State private var actions: PostActions?
    @State private var showsTopInset = true

    init(
        loader: PagedLoader<Post, PostsResponse>,
        emptyTitle: String = "Nothing here yet",
        emptyMessage: String? = "When there are new posts they'll show up here.",
        onSelectPost: @escaping (Post) -> Void,
        onSelectAuthor: @escaping (String) -> Void,
        onReply: ((Post) -> Void)? = nil,
        onReport: ((Post) -> Void)? = nil,
        scrollCollapsesTopInset: Bool = false,
        collapseInsetResetToken: AnyHashable? = nil,
        @ViewBuilder topSafeAreaInset: @escaping () -> TopInset
    ) {
        self.loader = loader
        self.emptyTitle = emptyTitle
        self.emptyMessage = emptyMessage
        self.onSelectPost = onSelectPost
        self.onSelectAuthor = onSelectAuthor
        self.onReply = onReply
        self.onReport = onReport
        self.scrollCollapsesTopInset = scrollCollapsesTopInset
        self.collapseInsetResetToken = collapseInsetResetToken
        self.topSafeAreaInset = topSafeAreaInset
    }

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
                    .listRowSeparator(.hidden)
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
        .listRowSpacing(TBLayout.feedListRowSpacing)
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(Color.clear)
        .feedScrollCollapsesTopInset(
            enabled: scrollCollapsesTopInset,
            showTopInset: $showsTopInset
        )
        .safeAreaInset(edge: .top, spacing: 0) {
            if scrollCollapsesTopInset {
                ZStack(alignment: .bottom) {
                    topSafeAreaInset()
                        .offset(y: showsTopInset ? 0 : -TBLayout.feedScopeHeaderHideOffset)
                        .opacity(showsTopInset ? 1 : 0)
                }
                .frame(height: TBLayout.feedScopeHeaderSlotHeight)
                .clipped()
                .allowsHitTesting(showsTopInset)
                .animation(TBLayout.easeOutExpo, value: showsTopInset)
            } else {
                topSafeAreaInset()
            }
        }
        .onChange(of: collapseInsetResetToken) { _, _ in
            guard scrollCollapsesTopInset else { return }
            showsTopInset = true
        }
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
        .tbReadableColumn()
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

private struct FeedScrollCollapseSample: Equatable {
    let bucket: Int
    let pinnedOpen: Bool

    init(_ g: ScrollGeometry) {
        let y = g.contentOffset.y
        let insetTop = g.contentInsets.top
        let pastTop = max(0, y - insetTop)
        pinnedOpen = pastTop < 18
        bucket = Int(floor(pastTop / TBLayout.feedScrollCollapseBucketPoints))
    }
}

private extension View {
    @ViewBuilder
    func feedScrollCollapsesTopInset(enabled: Bool, showTopInset: Binding<Bool>) -> some View {
        if enabled {
            self.onScrollGeometryChange(for: FeedScrollCollapseSample.self) { geo in
                FeedScrollCollapseSample(geo)
            } action: { previous, next in
                if next.pinnedOpen {
                    showTopInset.wrappedValue = true
                    return
                }
                if next.bucket > previous.bucket {
                    showTopInset.wrappedValue = false
                } else if next.bucket < previous.bucket {
                    showTopInset.wrappedValue = true
                }
            }
        } else {
            self
        }
    }
}

extension FeedListView where TopInset == EmptyView {
    init(
        loader: PagedLoader<Post, PostsResponse>,
        emptyTitle: String = "Nothing here yet",
        emptyMessage: String? = "When there are new posts they'll show up here.",
        onSelectPost: @escaping (Post) -> Void,
        onSelectAuthor: @escaping (String) -> Void,
        onReply: ((Post) -> Void)? = nil,
        onReport: ((Post) -> Void)? = nil
    ) {
        self.init(
            loader: loader,
            emptyTitle: emptyTitle,
            emptyMessage: emptyMessage,
            onSelectPost: onSelectPost,
            onSelectAuthor: onSelectAuthor,
            onReply: onReply,
            onReport: onReport,
            scrollCollapsesTopInset: false,
            collapseInsetResetToken: nil,
            topSafeAreaInset: { EmptyView() }
        )
    }
}
