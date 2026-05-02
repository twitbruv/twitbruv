import SwiftUI
import Observation

@Observable
@MainActor
final class SearchViewModel {
    let api: APIClient
    var query = ""
    var users: [UserSummary] = []
    var posts: [Post] = []
    var saved: [SavedSearch] = []
    var trending: [Hashtag] = []
    var isSearching = false
    var error: APIError?
    private var lastQuery = ""

    init(api: APIClient) { self.api = api }

    func loadOpening() async {
        do {
            async let trendResp: TrendingHashtagsResponse = api.get(API.Hashtags.trending())
            async let savedResp: SavedSearchesResponse = api.get(API.Search.saved())
            trending = try await trendResp.hashtags
            saved = try await savedResp.items
        } catch {
            // tolerate trending/saved failures
        }
    }

    func search() async {
        let q = query.trimmingCharacters(in: .whitespaces)
        guard q.count >= 2 else {
            users = []
            posts = []
            return
        }
        if q == lastQuery, isSearching { return }
        lastQuery = q
        isSearching = true
        defer { isSearching = false }
        do {
            let response: SearchResponse = try await api.get(API.Search.search(q))
            users = response.users
            posts = response.posts
            error = nil
        } catch let e as APIError {
            self.error = e
        } catch {
            self.error = .invalidResponse
        }
    }

    func saveCurrent() async {
        let q = query.trimmingCharacters(in: .whitespaces)
        guard q.count >= 2 else { return }
        struct Body: Encodable { let query: String }
        do {
            let response: SavedSearchResponse = try await api.send(
                API.Search.saveQuery(), body: Body(query: q)
            )
            saved.insert(response.item, at: 0)
        } catch {}
    }

    func deleteSaved(_ id: String) async {
        do {
            try await api.sendVoid(API.Search.deleteSaved(id))
            saved.removeAll { $0.id == id }
        } catch {}
    }
}

struct SearchView: View {
    @Environment(AppEnvironment.self) private var env

    @State private var vm: SearchViewModel?
    @State private var path = NavigationPath()

    var body: some View {
        NavigationStack(path: $path) {
            Group {
                if let vm {
                    List {
                        if vm.query.trimmingCharacters(in: .whitespaces).isEmpty {
                            if !vm.trending.isEmpty {
                                Section("Trending") {
                                    ForEach(vm.trending) { tag in
                                        Button {
                                            path.append(SearchRoute.hashtag(tag: tag.tag))
                                        } label: {
                                            HStack {
                                                Text("#\(tag.tag)").font(.callout.weight(.semibold))
                                                Spacer()
                                                if let n = tag.postCount {
                                                    Text("\(n) posts").font(.caption)
                                                        .foregroundStyle(.secondary)
                                                }
                                            }
                                        }
                                        .buttonStyle(.plain)
                                    }
                                }
                            }
                            if !vm.saved.isEmpty {
                                Section("Saved") {
                                    ForEach(vm.saved) { s in
                                        HStack {
                                            Text(s.query)
                                            Spacer()
                                            Button(role: .destructive) {
                                                Task { await vm.deleteSaved(s.id) }
                                            } label: {
                                                Image(systemName: "trash")
                                            }
                                            .buttonStyle(.plain)
                                        }
                                        .contentShape(.rect)
                                        .onTapGesture {
                                            vm.query = s.query
                                            Task { await vm.search() }
                                        }
                                    }
                                }
                            }
                        } else {
                            if !vm.users.isEmpty {
                                Section("People") {
                                    ForEach(vm.users) { user in
                                        NavigationLink {
                                            if let h = user.handle {
                                                ProfileView(handle: h)
                                            }
                                        } label: {
                                            UserRowView(user: user)
                                        }
                                    }
                                }
                            }
                            if !vm.posts.isEmpty {
                                Section("Posts") {
                                    ForEach(vm.posts) { post in
                                        Button {
                                            path.append(FeedRoute.thread(id: post.id))
                                        } label: {
                                            PostCardView(post: post)
                                        }
                                        .buttonStyle(.plain)
                                        .listRowInsets(EdgeInsets())
                                    }
                                }
                            }
                            if vm.users.isEmpty && vm.posts.isEmpty && !vm.isSearching {
                                Section {
                                    EmptyStateView(
                                        icon: "magnifyingglass",
                                        title: "No results"
                                    )
                                }
                            }
                        }
                    }
                    .listStyle(.insetGrouped)
                } else {
                    ProgressView()
                }
            }
            .navigationTitle("Search")
            .searchable(text: Binding(
                get: { vm?.query ?? "" },
                set: { vm?.query = $0 }
            ), prompt: "People, posts, #tags")
            .onSubmit(of: .search) {
                Task { await vm?.search() }
            }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    if let vm, !vm.query.isEmpty {
                        Button {
                            Task { await vm.saveCurrent() }
                        } label: {
                            Image(systemName: "bookmark")
                        }
                    }
                }
            }
            .navigationDestination(for: SearchRoute.self) { route in
                switch route {
                case .hashtag(let tag): HashtagView(tag: tag)
                }
            }
            .navigationDestination(for: FeedRoute.self) { route in
                switch route {
                case .thread(let id): ThreadView(postId: id)
                case .profile(let h): ProfileView(handle: h)
                case .compose(let p): ComposerView(mode: .reply(p))
                case .hashtag(let t): HashtagView(tag: t)
                }
            }
            .task {
                if vm == nil {
                    let new = SearchViewModel(api: env.api)
                    vm = new
                    await new.loadOpening()
                }
            }
        }
    }
}

enum SearchRoute: Hashable {
    case hashtag(tag: String)
}

struct HashtagView: View {
    @Environment(AppEnvironment.self) private var env
    let tag: String

    @State private var loader: PagedLoader<Post, PostsHashtagResponse>?
    @State private var path = NavigationPath()

    var body: some View {
        Group {
            if let loader {
                List {
                    ForEach(loader.items) { post in
                        PostCardView(post: post)
                            .listRowInsets(EdgeInsets())
                            .onTapGesture {
                                path.append(FeedRoute.thread(id: post.id))
                            }
                    }
                    LoadMoreFooter(
                        hasMore: loader.nextCursor != nil,
                        isLoading: loader.isLoading
                    ) { await loader.loadMore() }
                }
                .listStyle(.plain)
                .refreshable { await loader.reload() }
            } else {
                ProgressView().task {
                    loader = PagedLoader<Post, PostsHashtagResponse>(
                        api: env.api,
                        endpoint: { cursor in API.Hashtags.posts(tag, cursor: cursor) },
                        extract: { ($0.posts, $0.nextCursor) }
                    )
                    await loader?.loadInitial()
                }
            }
        }
        .navigationTitle("#\(tag)")
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(for: FeedRoute.self) { route in
            switch route {
            case .thread(let id): ThreadView(postId: id)
            case .profile(let h): ProfileView(handle: h)
            case .compose(let p): ComposerView(mode: .reply(p))
            case .hashtag(let t): HashtagView(tag: t)
            }
        }
    }
}
