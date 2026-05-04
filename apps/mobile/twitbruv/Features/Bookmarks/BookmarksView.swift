import SwiftUI

struct BookmarksView: View {
    @Environment(AppEnvironment.self) private var env

    @State private var loader: PagedLoader<Post, PostsResponse>?
    @State private var path = NavigationPath()
    @State private var reportTarget: Post?

    var body: some View {
        NavigationStack(path: $path) {
            Group {
                if let loader {
                    FeedListView(
                        loader: loader,
                        emptyTitle: "No bookmarks yet",
                        emptyMessage: "Tap the bookmark icon on any post to save it here.",
                        onSelectPost: { post in path.append(FeedRoute.thread(id: post.id)) },
                        onSelectAuthor: { handle in
                            path.append(FeedRoute.profile(handle: handle))
                        },
                        onReply: { post in path.append(FeedRoute.compose(replyTo: post)) },
                        onReport: { post in reportTarget = post }
                    )
                } else {
                    ProgressView()
                        .tint(TBColor.accent)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .background(Color.clear)
                        .task { setupLoader() }
                }
            }
            .navigationTitle("")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    TBPageHeader(title: "Bookmarks")
                }
            }
            .navigationDestination(for: FeedRoute.self) { route in
                switch route {
                case .thread(let id): ThreadView(postId: id)
                case .profile(let handle): ProfileView(handle: handle, navigationPath: $path)
                case .compose(let replyTo): ComposerView(mode: .reply(replyTo))
                case .hashtag(let tag): HashtagView(tag: tag)
                case .search(let q): SearchStackContent(path: $path, initialQuery: q)
                }
            }
            .sheet(item: $reportTarget) { post in
                ReportSheet(subject: .post(id: post.id))
            }
        }
    }

    private func setupLoader() {
        loader = PagedLoader<Post, PostsResponse>(
            api: env.api,
            endpoint: { cursor in API.Me.bookmarks(cursor: cursor) },
            extract: { ($0.posts, $0.nextCursor) }
        )
    }
}

#if DEBUG
#Preview("Light") {
    BookmarksView()
        .tbPreview(authState: .signedIn(user: .preview), colorScheme: .light)
}

#Preview("Dark") {
    BookmarksView()
        .tbPreview(authState: .signedIn(user: .preview), colorScheme: .dark)
}
#endif
