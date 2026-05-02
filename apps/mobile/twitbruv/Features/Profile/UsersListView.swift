import SwiftUI

struct UsersListView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss

    let title: String
    let endpoint: (String?) -> Endpoint

    @State private var loader: PagedLoader<UserSummary, UsersListResponse>?

    var body: some View {
        NavigationStack {
            Group {
                if let loader {
                    List {
                        if loader.items.isEmpty && loader.didLoadOnce {
                            EmptyStateView(
                                icon: "person.2",
                                title: "No accounts to show"
                            )
                            .listRowSeparator(.hidden)
                        }
                        ForEach(loader.items) { user in
                            NavigationLink {
                                if let handle = user.handle {
                                    ProfileView(handle: handle)
                                }
                            } label: {
                                UserRowView(user: user)
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
                    .background(TBColor.base1)
                    .refreshable { await loader.reload() }
                } else {
                    ProgressView()
                        .tint(TBColor.accent)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .background(TBColor.base1)
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
