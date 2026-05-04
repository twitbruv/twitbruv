import SwiftUI

enum FeedScope: String, CaseIterable, Identifiable {
    case following, network, discovery
    var id: String { rawValue }
    var label: String {
        switch self {
        case .following: return "Following"
        case .network: return "Network"
        case .discovery: return "Explore"
        }
    }
}

struct HomeFeedView: View {
    @Environment(AppEnvironment.self) private var env

    @State private var scope: FeedScope = .following
    @State private var followingLoader: PagedLoader<Post, PostsResponse>?
    @State private var networkLoader: PagedLoader<Post, PostsResponse>?
    @State private var discoveryLoader: PagedLoader<Post, PostsResponse>?
    @State private var path = NavigationPath()
    @State private var reportTarget: Post?

    var body: some View {
        NavigationStack(path: $path) {
            Group {
                if let loader = loader(for: scope) {
                    FeedListView(
                        loader: loader,
                        emptyTitle: emptyTitle(for: scope),
                        emptyMessage: emptyMessage(for: scope),
                        onSelectPost: { post in
                            path.append(FeedRoute.thread(id: post.id))
                        },
                        onSelectAuthor: { handle in
                            path.append(FeedRoute.profile(handle: handle))
                        },
                        onReply: { post in
                            path.append(FeedRoute.compose(replyTo: post))
                        },
                        onReport: { post in
                            reportTarget = post
                        },
                        scrollCollapsesTopInset: true,
                        collapseInsetResetToken: scope,
                        topSafeAreaInset: {
                            TBFeedSegmented(
                                selection: $scope,
                                options: FeedScope.allCases.map { ($0.label, $0) }
                            )
                            .padding(.horizontal, TBLayout.glassBarOuterMargin)
                            .padding(.top, 6)
                            .padding(.bottom, 6)
                        }
                    )
                } else {
                    ProgressView()
                        .tint(TBColor.accent)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .background(Color.clear)
                }
            }
            .toolbar(path.isEmpty ? .hidden : .automatic, for: .navigationBar)
            .navigationDestination(for: FeedRoute.self) { route in
                switch route {
                case .thread(let id):
                    ThreadView(postId: id)
                case .profile(let handle):
                    ProfileView(handle: handle, navigationPath: $path)
                case .compose(let replyTo):
                    ComposerView(mode: .reply(replyTo))
                case .hashtag(let tag):
                    HashtagView(tag: tag)
                case .search(let initialQuery):
                    SearchStackContent(path: $path, initialQuery: initialQuery)
                }
            }
            .sheet(item: $reportTarget) { post in
                ReportSheet(subject: .post(id: post.id))
            }
            .task { initializeLoaders() }
        }
    }

    private func initializeLoaders() {
        if followingLoader == nil {
            followingLoader = makeLoader(scope: .following)
        }
        if networkLoader == nil {
            networkLoader = makeLoader(scope: .network)
        }
        if discoveryLoader == nil {
            discoveryLoader = makeLoader(scope: .discovery)
        }
    }

    private func loader(for scope: FeedScope) -> PagedLoader<Post, PostsResponse>? {
        switch scope {
        case .following: return followingLoader
        case .network: return networkLoader
        case .discovery: return discoveryLoader
        }
    }

    private func makeLoader(scope: FeedScope) -> PagedLoader<Post, PostsResponse> {
        PagedLoader<Post, PostsResponse>(
            api: env.api,
            endpoint: { cursor in
                switch scope {
                case .following: return API.Feed.home(cursor: cursor)
                case .network: return API.Feed.network(cursor: cursor)
                case .discovery: return API.Feed.discovery(cursor: cursor)
                }
            },
            extract: { ($0.posts, $0.nextCursor) }
        )
    }

    private func emptyTitle(for scope: FeedScope) -> String {
        switch scope {
        case .following: return "Follow people to fill your feed"
        case .network: return "Your network is quiet"
        case .discovery: return "Nothing public to show"
        }
    }
    
    private func emptyMessage(for scope: FeedScope) -> String {
        switch scope {
        case .following: return "Posts from people you follow will appear here."
        case .network: return "Invite friends or follow more people to expand your feed."
        case .discovery: return "Public posts from the broader community show up here."
        }
    }
}

enum FeedRoute: Hashable {
    case thread(id: String)
    case profile(handle: String)
    case compose(replyTo: Post)
    case hashtag(tag: String)
    case search(initialQuery: String)
}

#if DEBUG
#Preview("Light") {
    HomeFeedView()
        .tbPreview(authState: .signedIn(user: .preview), colorScheme: .light)
}

#Preview("Dark") {
    HomeFeedView()
        .tbPreview(authState: .signedIn(user: .preview), colorScheme: .dark)
}
#endif
