import SwiftUI
import Observation

@Observable
@MainActor
final class SearchViewModel {
    let api: APIClient
    var rawQuery: String = ""
    var scope: SearchScope = .top
    var users: [UserSummary] = []
    var suggested: [UserSummary] = []
    var posts: [Post] = []
    var saved: [SavedSearch] = []
    var trending: [Hashtag] = []
    var isSearching = false
    var error: APIError?
    var openingErrorMessage: String?
    var didLoadOpening = false
    private var lastSearchedQuery = ""

    init(api: APIClient, initialQuery: String = "") {
        self.api = api
        self.rawQuery = initialQuery
    }

    var trimmedQuery: String {
        rawQuery.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var hasActiveQuery: Bool { trimmedQuery.count >= 2 }

    var currentFilters: SearchFilters {
        SearchFiltersCodec.parse(rawQuery)
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
        didLoadOpening = true
    }

    func search() async {
        let q = trimmedQuery
        guard q.count >= 2 else {
            users = []
            posts = []
            return
        }
        if q == lastSearchedQuery { return }
        lastSearchedQuery = q
        isSearching = true
        defer { isSearching = false }
        do {
            let response: SearchResponse = try await api.get(API.Search.search(q))
            users = response.users
            posts = response.posts
            error = nil
        } catch let e as APIError {
            self.error = e
            lastSearchedQuery = ""
        } catch {
            self.error = .invalidResponse
            lastSearchedQuery = ""
        }
    }

    func applyFilters(_ filters: SearchFilters) {
        rawQuery = SearchFiltersCodec.build(filters)
    }

    func saveCurrent() async -> String? {
        let q = trimmedQuery
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
    @State private var recents = SearchRecentsStore()
    @State private var mediaViewer: MediaViewerItem?
    @State private var debounceTask: Task<Void, Never>?
    @State private var showFilters = false

    var body: some View {
        Group {
            if let vm {
                listContent(vm: vm)
                    .tbListChrome()
                    .scrollDismissesKeyboard(.interactively)
                    .toolbarVisibility(.hidden, for: .navigationBar)
                    .safeAreaInset(edge: .top, spacing: 0) {
                        SearchHeaderBar(
                            query: Binding(
                                get: { vm.rawQuery },
                                set: { vm.rawQuery = $0 }
                            ),
                            scope: Binding(
                                get: { vm.scope },
                                set: { vm.scope = $0 }
                            ),
                            showScopes: vm.hasActiveQuery,
                            activeFilterCount: vm.currentFilters.activeOperatorCount,
                            canSave: vm.hasActiveQuery,
                            onSubmit: { submitSearch(vm: vm) },
                            onTapFilter: { showFilters = true },
                            onTapSave: { saveCurrent(vm: vm) }
                        )
                        .background(headerBackground)
                    }
                    .onChange(of: vm.rawQuery) { _, newValue in
                        debounceTask?.cancel()
                        debounceTask = Task { @MainActor in
                            try? await Task.sleep(for: .milliseconds(300))
                            guard !Task.isCancelled else { return }
                            if newValue.trimmingCharacters(in: .whitespacesAndNewlines).count >= 2 {
                                await vm.search()
                            } else {
                                vm.users = []
                                vm.posts = []
                            }
                        }
                    }
                    .sheet(isPresented: $showFilters) {
                        SearchFiltersSheet(
                            initial: vm.currentFilters,
                            onApply: { filters in
                                vm.applyFilters(filters)
                            }
                        )
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

    private var headerBackground: some View {
        TBColor.base1
            .overlay(alignment: .bottom) {
                TBColor.borderNeutral
                    .frame(height: 0.5)
            }
            .ignoresSafeArea(edges: .top)
    }

    private func submitSearch(vm: SearchViewModel) {
        let q = vm.trimmedQuery
        if q.count >= 2 {
            recents.add(q)
        }
        debounceTask?.cancel()
        Task { await vm.search() }
    }

    private func runQuery(_ query: String, vm: SearchViewModel) {
        debounceTask?.cancel()
        vm.rawQuery = query
        recents.add(query)
        Task { await vm.search() }
    }

    private func saveCurrent(vm: SearchViewModel) {
        Task {
            if let message = await vm.saveCurrent() {
                env.toast.show(message)
            } else {
                env.toast.show("Could not save search", kind: .error)
            }
        }
    }

    @ViewBuilder
    private func listContent(vm: SearchViewModel) -> some View {
        List {
            if vm.hasActiveQuery {
                resultsSections(vm: vm)
            } else {
                openingSections(vm: vm)
            }
        }
    }

    @ViewBuilder
    private func openingSections(vm: SearchViewModel) -> some View {
        if let openingErrorMessage = vm.openingErrorMessage {
            TBInlineState(
                kind: .error(openingErrorMessage),
                retryTitle: "Retry",
                retry: { Task { await vm.loadOpening() } }
            )
            .listRowSeparator(.hidden)
            .listRowBackground(Color.clear)
            .listRowInsets(EdgeInsets())
        }
        let nothingToShow = vm.didLoadOpening &&
            vm.openingErrorMessage == nil &&
            recents.items.isEmpty &&
            vm.suggested.isEmpty &&
            vm.trending.isEmpty &&
            vm.saved.isEmpty
        if nothingToShow {
            TBInlineState(
                kind: .empty(
                    icon: "magnifying-glass-solid",
                    title: "Discover what's happening",
                    message: "Search for people, posts, or #tags."
                )
            )
            .listRowSeparator(.hidden)
            .listRowBackground(Color.clear)
            .listRowInsets(EdgeInsets())
        }
        if !recents.items.isEmpty {
            sectionHeader(
                "Recent",
                trailing: AnyView(
                    Button("Clear") { recents.clear() }
                        .font(TBTypography.meta.weight(.medium))
                        .foregroundStyle(TBColor.textSecondary)
                )
            )
            ForEach(recents.items, id: \.self) { query in
                RecentSearchRow(
                    query: query,
                    onTap: {
                        runQuery(query, vm: vm)
                    },
                    onRemove: { recents.remove(query) }
                )
                .listRowInsets(EdgeInsets())
                .listRowSeparator(.hidden)
                .listRowBackground(Color.clear)
                .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                    Button(role: .destructive) {
                        recents.remove(query)
                    } label: {
                        Label("Remove", hero: "trash-solid")
                    }
                }
            }
        }
        if !vm.suggested.isEmpty {
            sectionHeader("Suggested")
            ForEach(vm.suggested) { user in
                if let handle = user.handle {
                    NavigationLink(value: FeedRoute.profile(handle: handle)) {
                        UserRowView(user: user)
                            .padding(.horizontal, TBLayout.pagePadding)
                            .padding(.vertical, 10)
                    }
                    .listRowInsets(EdgeInsets())
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
                }
            }
        }
        if !vm.trending.isEmpty {
            sectionHeader("Trending")
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    ForEach(vm.trending) { tag in
                        TrendingChip(tag: tag) {
                            path.append(SearchRoute.hashtag(tag: tag.tag))
                        }
                    }
                }
                .padding(.horizontal, TBLayout.pagePadding)
                .padding(.vertical, 4)
            }
            .listRowInsets(EdgeInsets())
            .listRowSeparator(.hidden)
            .listRowBackground(Color.clear)
        }
        if !vm.saved.isEmpty {
            sectionHeader("Saved")
            ForEach(vm.saved) { saved in
                SavedSearchRow(
                    query: saved.query,
                    onTap: {
                        runQuery(saved.query, vm: vm)
                    },
                    onDelete: {
                        Task {
                            let ok = await vm.deleteSaved(saved.id)
                            env.toast.show(
                                ok ? "Saved search removed" : "Could not remove saved search",
                                kind: ok ? .success : .error
                            )
                        }
                    }
                )
                .listRowInsets(EdgeInsets())
                .listRowSeparator(.hidden)
                .listRowBackground(Color.clear)
                .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                    Button(role: .destructive) {
                        Task {
                            let ok = await vm.deleteSaved(saved.id)
                            env.toast.show(
                                ok ? "Saved search removed" : "Could not remove saved search",
                                kind: ok ? .success : .error
                            )
                        }
                    } label: {
                        Label("Remove", hero: "trash-solid")
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func resultsSections(vm: SearchViewModel) -> some View {
        let showPeople = vm.scope == .top || vm.scope == .people
        let showPosts = vm.scope == .top || vm.scope == .posts

        if showPeople, !vm.users.isEmpty {
            sectionHeader("People")
            ForEach(vm.users) { user in
                if let handle = user.handle {
                    NavigationLink(value: FeedRoute.profile(handle: handle)) {
                        UserRowView(user: user)
                            .padding(.horizontal, TBLayout.pagePadding)
                            .padding(.vertical, 10)
                    }
                    .listRowInsets(EdgeInsets())
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
                }
            }
        }
        if showPosts, !vm.posts.isEmpty {
            sectionHeader("Posts")
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

        let nothingForScope =
            (showPeople ? vm.users.isEmpty : true) &&
            (showPosts ? vm.posts.isEmpty : true)
        if nothingForScope, !vm.isSearching {
            TBInlineState(
                kind: .empty(
                    icon: "magnifying-glass-solid",
                    title: emptyTitle(for: vm.scope),
                    message: emptyMessage(for: vm.scope, query: vm.trimmedQuery)
                )
            )
            .listRowSeparator(.hidden)
            .listRowBackground(Color.clear)
            .listRowInsets(EdgeInsets())
        }
    }

    @ViewBuilder
    private func sectionHeader(
        _ title: String,
        trailing: AnyView? = nil
    ) -> some View {
        HStack {
            Text(title)
                .font(TBTypography.cardTitle.weight(.semibold))
                .foregroundStyle(TBColor.textPrimary)
            Spacer()
            if let trailing { trailing }
        }
        .padding(.horizontal, TBLayout.pagePadding)
        .padding(.top, 14)
        .padding(.bottom, 2)
        .listRowInsets(EdgeInsets())
        .listRowSeparator(.hidden)
        .listRowBackground(Color.clear)
    }

    private func emptyTitle(for scope: SearchScope) -> String {
        switch scope {
        case .top: return "No results"
        case .people: return "No people found"
        case .posts: return "No posts found"
        }
    }

    private func emptyMessage(for scope: SearchScope, query: String) -> String? {
        guard !query.isEmpty else { return nil }
        switch scope {
        case .top: return "Try a different query or check your spelling."
        case .people: return "No accounts match “\(query)”."
        case .posts: return "No posts match “\(query)”."
        }
    }
}

private struct RecentSearchRow: View {
    let query: String
    let onTap: () -> Void
    let onRemove: () -> Void

    var body: some View {
        TappableRow(action: onTap) {
            HStack(spacing: 12) {
                HeroIcon(name: "clock-solid", size: 16)
                    .foregroundStyle(TBColor.textTertiary)
                    .frame(width: 24)
                Text(query)
                    .font(TBTypography.body)
                    .foregroundStyle(TBColor.textPrimary)
                    .lineLimit(1)
                Spacer()
                Button(action: onRemove) {
                    HeroIcon(name: "xmark-solid", size: 14)
                        .foregroundStyle(TBColor.textTertiary)
                        .frame(width: 30, height: 30)
                        .contentShape(.rect)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Remove recent search")
            }
            .padding(.horizontal, TBLayout.pagePadding)
            .padding(.vertical, 8)
        }
    }
}

private struct SavedSearchRow: View {
    let query: String
    let onTap: () -> Void
    let onDelete: () -> Void

    var body: some View {
        TappableRow(action: onTap) {
            HStack(spacing: 12) {
                HeroIcon(name: "bookmark-solid", size: 16)
                    .foregroundStyle(TBColor.accent)
                    .frame(width: 24)
                Text(query)
                    .font(TBTypography.body)
                    .foregroundStyle(TBColor.textPrimary)
                    .lineLimit(1)
                Spacer()
                Button(action: onDelete) {
                    HeroIcon(name: "trash-solid", size: 14)
                        .foregroundStyle(TBColor.textTertiary)
                        .frame(width: 30, height: 30)
                        .contentShape(.rect)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Delete saved search")
            }
            .padding(.horizontal, TBLayout.pagePadding)
            .padding(.vertical, 8)
        }
    }
}

private struct TrendingChip: View {
    let tag: Hashtag
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            VStack(alignment: .leading, spacing: 4) {
                Text("#\(tag.tag)")
                    .font(TBTypography.body.weight(.semibold))
                    .foregroundStyle(TBColor.textPrimary)
                if let count = tag.postCount {
                    Text("\(count) post\(count == 1 ? "" : "s")")
                        .font(TBTypography.caption)
                        .foregroundStyle(TBColor.textSecondary)
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .frame(minWidth: 120, alignment: .leading)
            .tbGlass(
                .card,
                in: RoundedRectangle(cornerRadius: TBLayout.radiusGlassCard, style: .continuous),
                shadow: false
            )
        }
        .buttonStyle(TBSquishButtonStyle())
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
