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

    init(api: APIClient, initialQuery: String = "") {
        self.api = api
        self.query = initialQuery
    }

    func loadOpening() async {
        do {
            async let trendResp: TrendingHashtagsResponse = api.get(API.Hashtags.trending())
            async let savedResp: SavedSearchesResponse = api.get(API.Search.saved())
            trending = try await trendResp.hashtags
            saved = try await savedResp.items
        } catch {}
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
    @State private var path = NavigationPath()

    var body: some View {
        NavigationStack(path: $path) {
            SearchStackContent(path: $path, initialQuery: nil)
        }
    }
}

#if DEBUG
#Preview("Light") {
    SearchView()
        .tbPreview(authState: .signedIn(user: .preview), colorScheme: .light)
}

#Preview("Dark") {
    SearchView()
        .tbPreview(authState: .signedIn(user: .preview), colorScheme: .dark)
}
#endif

struct SearchStackContent: View {
    @Environment(AppEnvironment.self) private var env
    @Binding var path: NavigationPath
    var initialQuery: String?

    @State private var vm: SearchViewModel?

    var body: some View {
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
                                            HeroIcon(name: "trash-solid", size: 16)
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
                                    if let h = user.handle {
                                        NavigationLink(value: FeedRoute.profile(handle: h)) {
                                            UserRowView(user: user)
                                        }
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
                                    .listRowSeparator(.hidden)
                                    .listRowBackground(Color.clear)
                                }
                            }
                        }
                        if vm.users.isEmpty && vm.posts.isEmpty && !vm.isSearching {
                            Section {
                                EmptyStateView(
                                    icon: "magnifying-glass-solid",
                                    title: "No results"
                                )
                            }
                        }
                    }
                }
                .listRowSpacing(TBLayout.feedListRowSpacing)
                .listStyle(.insetGrouped)
                .scrollContentBackground(.hidden)
                .background(Color.clear)
                .tbReadableColumn()
                .navigationTitle("Search")
                .searchable(
                    text: Binding(get: { vm.query }, set: { vm.query = $0 }),
                    prompt: "People, posts, #tags"
                )
                .onSubmit(of: .search) {
                    Task { await vm.search() }
                }
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        if !vm.query.isEmpty {
                            Button {
                                Task { await vm.saveCurrent() }
                            } label: {
                                HeroIcon(name: "bookmark-outline", size: 18)
                            }
                        }
                    }
                }
            } else {
                ProgressView()
                    .tint(TBColor.accent)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Color.clear)
            }
        }
        .navigationDestination(for: SearchRoute.self) { route in
            switch route {
            case .hashtag(let tag): HashtagView(tag: tag)
            }
        }
        .navigationDestination(for: FeedRoute.self) { route in
            switch route {
            case .thread(let id):
                ThreadView(postId: id)
            case .profile(let h):
                ProfileView(handle: h, navigationPath: $path)
            case .compose(let p):
                ComposerView(mode: .reply(p))
            case .quote(let target):
                ComposerView(mode: .quote(target))
            case .hashtag(let t):
                HashtagView(tag: t)
            case .search(let q):
                SearchStackContent(path: $path, initialQuery: q)
            }
        }
        .task {
            if vm == nil {
                let q = initialQuery ?? ""
                let new = SearchViewModel(api: env.api, initialQuery: q)
                vm = new
                await new.loadOpening()
                if q.count >= 2 {
                    await new.search()
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
                            .listRowSeparator(.hidden)
                            .listRowBackground(Color.clear)
                            .onTapGesture {
                                path.append(FeedRoute.thread(id: post.id))
                            }
                    }
                    LoadMoreFooter(
                        hasMore: loader.nextCursor != nil,
                        isLoading: loader.isLoading
                    ) { await loader.loadMore() }
                }
                .listRowSpacing(TBLayout.feedListRowSpacing)
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
                .background(Color.clear)
                .refreshable { await loader.reload() }
                .tbReadableColumn()
            } else {
                ProgressView()
                    .tint(TBColor.accent)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Color.clear)
                    .task {
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
            case .thread(let id):
                ThreadView(postId: id)
            case .profile(let h):
                ProfileView(handle: h, navigationPath: $path)
            case .compose(let p):
                ComposerView(mode: .reply(p))
            case .quote(let target):
                ComposerView(mode: .quote(target))
            case .hashtag(let t):
                HashtagView(tag: t)
            case .search(let q):
                SearchStackContent(path: $path, initialQuery: q)
            }
        }
    }
}
