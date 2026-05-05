import SwiftUI

struct UsersListView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss

    let title: String
    let endpoint: (String?) -> Endpoint

    @State private var loader: PagedLoader<UserSummary, UsersListResponse>?
    @State private var navigationPath = NavigationPath()

    var body: some View {
        NavigationStack(path: $navigationPath) {
            Group {
                if let loader {
                    List {
                        if loader.items.isEmpty && loader.didLoadOnce {
                            EmptyStateView(
                                icon: "users-solid",
                                title: "No accounts to show"
                            )
                            .listRowSeparator(.hidden)
                        }
                        ForEach(loader.items) { user in
                            if let handle = user.handle {
                                NavigationLink(value: FeedRoute.profile(handle: handle)) {
                                    UserRowView(user: user)
                                }
                            }
                        }
                        LoadMoreFooter(
                            hasMore: loader.nextCursor != nil,
                            isLoading: loader.isLoading
                        ) {
                            await loader.loadMore()
                        }
                    }
                    .listStyle(.plain)
                    .scrollContentBackground(.hidden)
                    .background(Color.clear)
                    .refreshable { await loader.reload() }
                } else {
                    ProgressView()
                        .tint(TBColor.accent)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .background(Color.clear)
                }
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                        .foregroundStyle(TBColor.accent)
                }
            }
            .navigationDestination(for: FeedRoute.self) { route in
                switch route {
                case .thread(let id): ThreadView(postId: id)
                case .profile(let h): ProfileView(handle: h, navigationPath: $navigationPath)
                case .compose(let p): ComposerView(mode: .reply(p))
                case .quote(let target): ComposerView(mode: .quote(target))
                case .hashtag(let t): HashtagView(tag: t)
                case .search(let q): SearchStackContent(path: $navigationPath, initialQuery: q)
                }
            }
            .task {
                if loader == nil {
                    loader = PagedLoader<UserSummary, UsersListResponse>(
                        api: env.api,
                        endpoint: endpoint,
                        extract: { ($0.users, $0.nextCursor) }
                    )
                    await loader?.loadInitial()
                }
            }
        }
    }
}
