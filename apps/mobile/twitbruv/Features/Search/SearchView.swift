import SwiftUI
import Observation

@Observable
@MainActor
final class SearchViewModel {
    let api: APIClient
    var query = ""
    var users: [UserSummary] = []
    var suggested: [UserSummary] = []
    var posts: [Post] = []
    var saved: [SavedSearch] = []
    var trending: [Hashtag] = []
    var isSearching = false
    var error: APIError?
    var openingErrorMessage: String?
    private var lastQuery = ""

    init(api: APIClient, initialQuery: String = "") {
        self.api = api
        self.query = initialQuery
    }

    func loadOpening() async {
        do {
            async let trendResp: TrendingHashtagsResponse = api.get(API.Hashtags.trending())
            async let savedResp: SavedSearchesResponse = api.get(API.Search.saved())
            async let suggestedResp: SuggestedUsersResponse = api.get(API.Users.suggested())
            trending = try await trendResp.hashtags
            saved = try await savedResp.items
            suggested = try await suggestedResp.users
            openingErrorMessage = nil
        } catch {
            openingErrorMessage = "Could not load search suggestions."
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

    func saveCurrent() async -> String? {
        let q = query.trimmingCharacters(in: .whitespaces)
        guard q.count >= 2 else { return nil }
        guard !saved.contains(where: { $0.query.caseInsensitiveCompare(q) == .orderedSame }) else {
            return "Search already saved"
        }
        struct Body: Encodable { let query: String }
        do {
            let response: SavedSearchResponse = try await api.send(
                API.Search.saveQuery(), body: Body(query: q)
            )
            saved.insert(response.item, at: 0)
            return "Search saved"
        } catch {
            return nil
        }
    }

    func deleteSaved(_ id: String) async -> Bool {
        do {
            try await api.sendVoid(API.Search.deleteSaved(id))
            saved.removeAll { $0.id == id }
            return true
        } catch {
            return false
        }
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

    @Environment(\.openURL) private var openURL
    @State private var vm: SearchViewModel?
    @State private var actions: PostActions?
    @State private var mediaViewer: MediaViewerItem?
    @State private var debounceTask: Task<Void, Never>?

    var body: some View {
        Group {
            if let vm {
                List {
                    if let openingErrorMessage = vm.openingErrorMessage,
                       vm.query.trimmingCharacters(in: .whitespaces).isEmpty
                    {
                        TBInlineState(
                            kind: .error(openingErrorMessage),
                            retryTitle: "Retry",
                            retry: { Task { await vm.loadOpening() } }
                        )
                        .listRowSeparator(.hidden)
                    }
                    if vm.query.trimmingCharacters(in: .whitespaces).isEmpty {
                        if !vm.suggested.isEmpty {
                            Section("Suggested") {
                                ForEach(vm.suggested) { user in
                                    if let h = user.handle {
                                        NavigationLink(value: FeedRoute.profile(handle: h)) {
                                            UserRowView(user: user)
                                        }
                                    }
                                }
                            }
                        }
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
                                            Task {
                                                let ok = await vm.deleteSaved(s.id)
                                                env.toast.show(
                                                    ok ? "Saved search removed" : "Could not remove saved search",
                                                    kind: ok ? .success : .error
                                                )
                                            }
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
                                        PostCardView(
                                            post: post,
                                            displayMode: .compact,
                                            onLike: { Task { await actions?.toggleLike(post) } },
                                            onRepost: { Task { await actions?.toggleRepost(post) } },
                                            onQuote: { path.append(FeedRoute.quote(target: post)) },
                                            onBookmark: { Task { await actions?.toggleBookmark(post) } },
                                            onReply: { path.append(FeedRoute.compose(replyTo: post)) },
                                            onTapAuthor: {
                                                if let h = post.author.handle {
                                                    path.append(FeedRoute.profile(handle: h))
                                                }
                                            },
                                            onTapMedia: { media, all in
                                                mediaViewer = MediaViewerItem(media: all, initialID: media.id)
                                            },
                                            onTapHashtag: { tag in
                                                path.append(SearchRoute.hashtag(tag: tag))
                                            },
                                            onTapURL: { url in openURL(url) },
                                            onVotePoll: { pollId, optionId in
                                                Task {
                                                    await actions?.votePoll(
                                                        pollId: pollId,
                                                        optionId: optionId,
                                                        previousOptionIds: post.poll?.viewerVoteOptionIds
                                                    )
                                                }
                                            }
                                        )
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
                                TBInlineState(
                                    kind: .empty(
                                        icon: "magnifying-glass-solid",
                                        title: "No results",
                                        message: nil
                                    )
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
                .onChange(of: vm.query) { _, newValue in
                    debounceTask?.cancel()
                    debounceTask = Task { @MainActor in
                        try? await Task.sleep(for: .milliseconds(300))
                        guard !Task.isCancelled else { return }
                        if newValue.trimmingCharacters(in: .whitespaces).count >= 2 {
                            await vm.search()
                        }
                    }
                }
                .onSubmit(of: .search) {
                    Task { await vm.search() }
                }
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        if !vm.query.isEmpty {
                            Button {
                                Task {
                                    if let message = await vm.saveCurrent() {
                                        env.toast.show(message)
                                    } else {
                                        env.toast.show("Could not save search", kind: .error)
                                    }
                                }
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
                actions = PostActions(api: env.api)
                let q = initialQuery ?? ""
                let new = SearchViewModel(api: env.api, initialQuery: q)
                vm = new
                await new.loadOpening()
                if q.count >= 2 {
                    await new.search()
                }
            }
        }
        .sheet(item: $mediaViewer) { item in
            MediaViewerView(media: item.media, initialID: item.initialID)
        }
        .onReceive(
            NotificationCenter.default.publisher(for: .postMutated)
        ) { note in
            guard let box = note.userInfo?["mutation"] as? MutationBox else { return }
            if let id = note.userInfo?["id"] as? String {
                guard let vm, let idx = vm.posts.firstIndex(where: { $0.id == id }) else { return }
                if case .deleted = box.mutation {
                    vm.posts.remove(at: idx)
                } else {
                    box.mutation.apply(to: &vm.posts[idx])
                }
            } else if note.userInfo?["pollId"] is String {
                guard let vm else { return }
                for idx in vm.posts.indices {
                    box.mutation.apply(to: &vm.posts[idx])
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
    @State private var reportTarget: Post?

    var body: some View {
        Group {
            if let loader {
                FeedListView(
                    loader: loader,
                    emptyTitle: "No posts for #\(tag)",
                    emptyMessage: nil,
                    onSelectPost: { post in path.append(FeedRoute.thread(id: post.id)) },
                    onSelectAuthor: { handle in path.append(FeedRoute.profile(handle: handle)) },
                    onReply: { post in path.append(FeedRoute.compose(replyTo: post)) },
                    onQuote: { post in path.append(FeedRoute.quote(target: post)) },
                    onReport: { post in reportTarget = post },
                    onSelectHashtag: { tag in path.append(FeedRoute.hashtag(tag: tag)) }
                )
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
        .sheet(item: $reportTarget) { post in
            ReportSheet(subject: .post(id: post.id))
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
    }
}
