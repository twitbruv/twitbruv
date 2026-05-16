import SwiftUI

struct FeedListView<TopInset: View, Page: Decodable & Sendable>: View {
    @Environment(AppEnvironment.self) private var env
    @Bindable var loader: PagedLoader<Post, Page>
    var emptyTitle: String = "Nothing here yet"
    var emptyMessage: String? = "When there are new posts they'll show up here."
    var onSelectPost: (Post) -> Void
    var onSelectAuthor: (String) -> Void
    var onReply: ((Post) -> Void)? = nil
    var onQuote: ((Post) -> Void)? = nil
    var onReport: ((Post) -> Void)? = nil
    var onSelectHashtag: ((String) -> Void)? = nil
    var scrollCollapsesTopInset: Bool = false
    var collapseInsetResetToken: AnyHashable? = nil
    @ViewBuilder var topSafeAreaInset: () -> TopInset

    @Environment(\.openURL) private var openURL
    @State private var actions: PostActions?
    @State private var mediaViewer: MediaViewerItem?
    @State private var headerCollapseAmount: CGFloat = 0
    @State private var headerSnapped = false
    @State private var reverseAccumulator: CGFloat = 0
    @State private var restingY: CGFloat?
    private let snapThreshold: CGFloat = 0.15
    private let reverseThreshold: CGFloat = 20
    private let haptic: UIImpactFeedbackGenerator = {
        let g = UIImpactFeedbackGenerator(style: .light)
        g.prepare()
        return g
    }()

    init(
        loader: PagedLoader<Post, Page>,
        emptyTitle: String = "Nothing here yet",
        emptyMessage: String? = "When there are new posts they'll show up here.",
        onSelectPost: @escaping (Post) -> Void,
        onSelectAuthor: @escaping (String) -> Void,
        onReply: ((Post) -> Void)? = nil,
        onQuote: ((Post) -> Void)? = nil,
        onReport: ((Post) -> Void)? = nil,
        onSelectHashtag: ((String) -> Void)? = nil,
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
        self.onQuote = onQuote
        self.onReport = onReport
        self.onSelectHashtag = onSelectHashtag
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
                        icon: "rectangle-stack-solid",
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
                        icon: "rectangle-stack-solid",
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
                    TappableRow(action: { onSelectPost(post) }) {
                        PostCardView(
                            post: post,
                            onLike: { Task { await actions?.toggleLike(post) } },
                            onRepost: { Task { await actions?.toggleRepost(post) } },
                            onQuote: { onQuote?(post) },
                            onBookmark: { Task { await actions?.toggleBookmark(post) } },
                            onReply: { onReply?(post) },
                            onTapAuthor: {
                                if let h = post.author.handle { onSelectAuthor(h) }
                            },
                            onTapMedia: { media, all in
                                mediaViewer = MediaViewerItem(media: all, initialID: media.id)
                            },
                            onTapHashtag: { tag in
                                onSelectHashtag?(tag)
                            },
                            onTapURL: { url in
                                openURL(url)
                            },
                            onVotePoll: { pollId, optionId in
                                Task {
                                    let previous = (post.repostOf?.value ?? post).poll?.viewerVoteOptionIds
                                    await actions?.votePoll(
                                        pollId: pollId,
                                        optionId: optionId,
                                        previousOptionIds: previous
                                    )
                                }
                            },
                            onMenuAction: { action in
                                handleMenu(action: action, post: post)
                            }
                        )
                    }
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
        .onScrollGeometryChange(for: CGFloat.self) { geo in
            geo.contentOffset.y
        } action: { old, new in
            guard scrollCollapsesTopInset else { return }
            if restingY == nil { restingY = old }
            let delta = new - old
            let scrolled = new - (restingY ?? old)

            if scrolled <= 10 {
                if headerSnapped {
                    headerSnapped = false
                    reverseAccumulator = 0
                    withAnimation(.spring(response: 0.28, dampingFraction: 0.82)) {
                        headerCollapseAmount = 0
                    }
                }
                return
            }

            let snapPoint = TBLayout.feedScopeHeaderSlotHeight * snapThreshold

            if !headerSnapped {
                reverseAccumulator = 0
                headerCollapseAmount = min(snapPoint, max(0, headerCollapseAmount + delta))
                if headerCollapseAmount >= snapPoint && delta > 0 {
                    haptic.impactOccurred()
                    haptic.prepare()
                    headerSnapped = true
                    reverseAccumulator = 0
                    withAnimation(.spring(response: 0.28, dampingFraction: 0.82)) {
                        headerCollapseAmount = TBLayout.feedScopeHeaderSlotHeight
                    }
                }
            } else {
                if delta < 0 {
                    reverseAccumulator -= delta
                } else {
                    reverseAccumulator = max(0, reverseAccumulator - delta)
                }
                if reverseAccumulator >= reverseThreshold {
                    haptic.impactOccurred()
                    haptic.prepare()
                    headerSnapped = false
                    reverseAccumulator = 0
                    withAnimation(.spring(response: 0.28, dampingFraction: 0.82)) {
                        headerCollapseAmount = 0
                    }
                }
            }
        }
        .safeAreaInset(edge: .top, spacing: 0) {
            if scrollCollapsesTopInset {
                let collapsed = headerSnapped
                ZStack {
                    topSafeAreaInset()
                        .scaleEffect(collapsed ? 0.6 : 1, anchor: .center)
                        .offset(y: collapsed ? -TBLayout.feedScopeHeaderSlotHeight * 0.5 : 0)
                        .opacity(collapsed ? 0 : 1)
                        .allowsHitTesting(!collapsed)
                        .animation(.spring(response: 0.28, dampingFraction: 0.82), value: collapsed)
                }
                .frame(height: TBLayout.feedScopeHeaderSlotHeight)
                .clipped()
            } else {
                topSafeAreaInset()
            }
        }
        .onChange(of: collapseInsetResetToken) { _, _ in
            guard scrollCollapsesTopInset else { return }
            withAnimation(.spring(response: 0.28, dampingFraction: 0.82)) {
                headerCollapseAmount = 0
            }
            headerSnapped = false
            reverseAccumulator = 0
            restingY = nil
        }
        .refreshable {
            await loader.reload()
            await env.badges.refreshAll()
        }
        .sheet(item: $mediaViewer) { item in
            MediaViewerView(media: item.media, initialID: item.initialID)
        }
        .task(id: ObjectIdentifier(loader)) {
            if actions == nil { actions = PostActions(api: env.api) }
            await loader.loadInitial()
        }
        .onReceive(
            NotificationCenter.default.publisher(for: .postMutated)
        ) { note in
            guard
                let id = note.userInfo?["id"] as? String,
                let box = note.userInfo?["mutation"] as? MutationBox
            else {
                if note.userInfo?["pollId"] is String,
                   let box = note.userInfo?["mutation"] as? MutationBox
                {
                    loader.patchAll { post in
                        box.mutation.apply(to: &post)
                    }
                }
                return
            }
            if case .deleted = box.mutation {
                loader.remove(id: id)
            } else {
                loader.patch(id: id) { post in box.mutation.apply(to: &post) }
            }
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
            env.toast.show("Post link copied")
        case .viewProfile(let handle):
            onSelectAuthor(handle)
        case .report(let id):
            if let onReport, let p = loader.items.first(where: { $0.id == id }) {
                onReport(p)
            }
        }
    }
}



extension FeedListView where TopInset == EmptyView {
    init(
        loader: PagedLoader<Post, Page>,
        emptyTitle: String = "Nothing here yet",
        emptyMessage: String? = "When there are new posts they'll show up here.",
        onSelectPost: @escaping (Post) -> Void,
        onSelectAuthor: @escaping (String) -> Void,
        onReply: ((Post) -> Void)? = nil,
        onQuote: ((Post) -> Void)? = nil,
        onReport: ((Post) -> Void)? = nil,
        onSelectHashtag: ((String) -> Void)? = nil
    ) {
        self.init(
            loader: loader,
            emptyTitle: emptyTitle,
            emptyMessage: emptyMessage,
            onSelectPost: onSelectPost,
            onSelectAuthor: onSelectAuthor,
            onReply: onReply,
            onQuote: onQuote,
            onReport: onReport,
            onSelectHashtag: onSelectHashtag,
            scrollCollapsesTopInset: false,
            collapseInsetResetToken: nil,
            topSafeAreaInset: { EmptyView() }
        )
    }
}
