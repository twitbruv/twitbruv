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
                    ProgressView().task { setupLoader() }
                }
            }
            .navigationTitle("Bookmarks")
            .navigationDestination(for: FeedRoute.self) { route in
                switch route {
                case .thread(let id): ThreadView(postId: id)
                case .profile(let handle): ProfileView(handle: handle)
                case .compose(let replyTo): ComposerView(mode: .reply(replyTo))
                case .hashtag(let tag): HashtagView(tag: tag)
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
