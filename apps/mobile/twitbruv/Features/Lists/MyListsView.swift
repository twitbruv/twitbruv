import SwiftUI

struct MyListsView: View {
    @Environment(AppEnvironment.self) private var env

    @State private var lists: [UserList] = []
    @State private var isLoading = false
    @State private var showCreate = false
    @State private var newName = ""
    @State private var newDescription = ""
    @State private var newVisibility = "public"
    @State private var errorMessage: String?

    var body: some View {
        List {
            if let errorMessage {
                TBInlineState(
                    kind: .error(errorMessage),
                    retryTitle: "Retry",
                    retry: { Task { await load() } }
                )
                .listRowSeparator(.hidden)
            }
            if lists.isEmpty && !isLoading {
                TBInlineState(
                    kind: .empty(
                        icon: "queue-list-solid",
                        title: "No lists yet",
                        message: "Create a list to organize accounts you follow."
                    )
                )
                .listRowSeparator(.hidden)
            }
            ForEach(lists) { list in
                NavigationLink {
                    ListDetailView(list: list)
                } label: {
                    HStack {
                        HeroIcon(name: "queue-list-solid", size: 18)
                            .foregroundStyle(TBColor.accent)
                        VStack(alignment: .leading) {
                            Text(list.name)
                                .font(TBTypography.meta.weight(.semibold))
                                .foregroundStyle(TBColor.textPrimary)
                            if let n = list.memberCount {
                                Text("\(n) members")
                                    .font(TBTypography.caption)
                                    .foregroundStyle(TBColor.textSecondary)
                            }
                        }
                    }
                }
            }
        }
        .tbListChrome()
        .navigationTitle("Lists")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { showCreate = true } label: {
                    HeroIcon(name: "plus-solid", size: 18)
                        .foregroundStyle(TBColor.accent)
                }
            }
        }
        .sheet(isPresented: $showCreate) {
            createSheet
        }
        .refreshable { await load() }
        .task { await load() }
    }

    private var createSheet: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Name", text: $newName)
                    TextField("Description", text: $newDescription, axis: .vertical)
                        .lineLimit(2...4)
                    Picker("Visibility", selection: $newVisibility) {
                        Text("Public").tag("public")
                        Text("Private").tag("private")
                    }
                }
            }
            .navigationTitle("New list")
            .navigationBarTitleDisplayMode(.inline)
            .scrollContentBackground(.hidden)
            .background(Color.clear)
            .presentationBackground(.ultraThinMaterial)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { showCreate = false }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Create") { Task { await create() } }
                        .disabled(newName.isEmpty)
                }
            }
        }
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            let response: ListsResponse = try await env.api.get(API.Lists.mine())
            lists = response.lists
            errorMessage = nil
        } catch {
            errorMessage = "Could not load lists."
        }
    }

    private func create() async {
        do {
            let response: ListResponse = try await env.api.send(
                API.Lists.create(),
                body: CreateListBody(
                    name: newName,
                    description: newDescription,
                    visibility: newVisibility
                )
            )
            lists.insert(response.list, at: 0)
            newName = ""; newDescription = ""; newVisibility = "public"
            showCreate = false
            env.toast.show("List created")
        } catch {
            env.toast.show("Could not create list", kind: .error)
        }
    }
}

#if DEBUG
#Preview("Light") {
    NavigationStack {
        MyListsView()
    }
    .tbPreview(authState: .signedIn(user: .preview), colorScheme: .light)
}

#Preview("Dark") {
    NavigationStack {
        MyListsView()
    }
    .tbPreview(authState: .signedIn(user: .preview), colorScheme: .dark)
}
#endif

struct ListDetailView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.openURL) private var openURL
    let list: UserList

    @State private var members: [UserSummary] = []
    @State private var loader: PagedLoader<Post, PostsResponse>?
    @State private var tab: ListTab = .timeline
    @State private var showAdd = false
    @State private var actions: PostActions?
    @State private var route: PendingFeedRoute?
    @State private var mediaViewer: MediaViewerItem?
    @State private var reportTarget: Post?
    @State private var memberErrorMessage: String?

    var body: some View {
        Group {
            if let loader {
                List {
                    Section {
                        TBFeedSegmented(
                            selection: $tab,
                            options: [
                                ("Timeline", ListTab.timeline),
                                ("Members (\(members.count))", ListTab.members),
                            ]
                        )
                        .listRowInsets(EdgeInsets(top: 0, leading: 16, bottom: 8, trailing: 16))
                        .listRowSeparator(.hidden)
                    }

                    switch tab {
                    case .timeline:
                        if let error = loader.error, loader.items.isEmpty {
                            TBInlineState(
                                kind: .error(error.localizedDescription),
                                retryTitle: "Retry",
                                retry: { Task { await loader.reload() } }
                            )
                            .listRowSeparator(.hidden)
                        } else if loader.items.isEmpty && loader.didLoadOnce {
                            TBInlineState(
                                kind: .empty(
                                    icon: "queue-list-solid",
                                    title: "No posts in this list",
                                    message: nil
                                )
                            )
                            .listRowSeparator(.hidden)
                        }
                        ForEach(loader.items) { post in
                            timelinePostRow(post)
                        }
                        LoadMoreFooter(
                            hasMore: loader.nextCursor != nil,
                            isLoading: loader.isLoading
                        ) { await loader.loadMore() }
                    case .members:
                        if let memberErrorMessage {
                            TBInlineState(
                                kind: .error(memberErrorMessage),
                                retryTitle: "Retry",
                                retry: { Task { await loadMembers() } }
                            )
                            .listRowSeparator(.hidden)
                        } else if members.isEmpty {
                            TBInlineState(
                                kind: .empty(
                                    icon: "users-solid",
                                    title: "No members yet",
                                    message: nil
                                )
                            )
                            .listRowSeparator(.hidden)
                        }
                        ForEach(members) { user in
                            UserRowView(user: user)
                        }
                    }
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
                .background(Color.clear)
                .refreshable {
                    await loader.reload()
                    await loadMembers()
                }
            } else {
                TBInlineState(kind: .loading("Loading list"))
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Color.clear)
                    .task { await setup() }
            }
        }
        .navigationTitle(list.name)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { showAdd = true } label: {
                    HeroIcon(name: "user-plus-solid", size: 18)
                        .foregroundStyle(TBColor.accent)
                }
            }
        }
        .sheet(isPresented: $showAdd) {
            AddMembersSheet(listId: list.id) {
                Task { await loadMembers() }
            }
        }
        .sheet(item: $mediaViewer) { item in
            MediaViewerView(media: item.media, initialID: item.initialID)
        }
        .sheet(item: $reportTarget) { post in
            ReportSheet(subject: .post(id: post.id))
        }
        .navigationDestination(item: $route) { pending in
            switch pending.route {
            case .thread(let id):
                ThreadView(postId: id)
            case .profile(let handle):
                ProfileView(handle: handle, navigationPath: .constant(NavigationPath()))
            case .compose(let post):
                ComposerView(mode: .reply(post))
            case .quote(let target):
                ComposerView(mode: .quote(target))
            case .hashtag(let tag):
                HashtagView(tag: tag)
            case .search(let query):
                SearchStackContent(path: .constant(NavigationPath()), initialQuery: query)
            }
        }
        .onReceive(
            NotificationCenter.default.publisher(for: .postMutated)
        ) { note in
            guard let loader, let box = note.userInfo?["mutation"] as? MutationBox else {
                return
            }
            if let id = note.userInfo?["id"] as? String {
                if case .deleted = box.mutation {
                    loader.remove(id: id)
                } else {
                    loader.patch(id: id) { post in box.mutation.apply(to: &post) }
                }
            } else if note.userInfo?["pollId"] is String {
                loader.patchAll { post in box.mutation.apply(to: &post) }
            }
        }
    }

    enum ListTab: Hashable { case timeline, members }
    
    private func timelinePostRow(_ post: Post) -> some View {
        TappableRow(action: {
            route = PendingFeedRoute(.thread(id: post.id))
        }) {
            PostCardView(
                post: post,
                onLike: { Task { await actions?.toggleLike(post) } },
                onRepost: { Task { await actions?.toggleRepost(post) } },
                onQuote: { route = PendingFeedRoute(.quote(target: post)) },
                onBookmark: { Task { await actions?.toggleBookmark(post) } },
                onReply: { route = PendingFeedRoute(.compose(replyTo: post)) },
                onTapAuthor: {
                    if let handle = post.author.handle {
                        route = PendingFeedRoute(.profile(handle: handle))
                    }
                },
                onTapMedia: { media, all in
                    mediaViewer = MediaViewerItem(media: all, initialID: media.id)
                },
                onTapHashtag: { tag in
                    route = PendingFeedRoute(.hashtag(tag: tag))
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
                },
                onMenuAction: { action in handleMenu(action, post: post) }
            )
        }
        .listRowInsets(EdgeInsets())
        .listRowSeparator(.hidden)
        .listRowBackground(Color.clear)
    }

    private func setup() async {
        actions = PostActions(api: env.api)
        loader = PagedLoader<Post, PostsResponse>(
            api: env.api,
            endpoint: { cursor in API.Lists.timeline(list.id, cursor: cursor) },
            extract: { ($0.posts, $0.nextCursor) }
        )
        await loader?.loadInitial()
        await loadMembers()
    }

    private func loadMembers() async {
        do {
            let response: ListMembersResponse = try await env.api.get(
                API.Lists.members(list.id)
            )
            members = response.members
            memberErrorMessage = nil
        } catch {
            memberErrorMessage = "Could not load list members."
        }
    }

    private func handleMenu(_ action: PostMenuAction, post: Post) {
        switch action {
        case .copyLink(let id):
            UIPasteboard.general.string =
                Config.webBaseURL.appendingPathComponent(
                    "/@\(post.author.handle ?? "")/\(id)"
                ).absoluteString
            env.toast.show("Post link copied")
        case .viewProfile(let handle):
            route = PendingFeedRoute(.profile(handle: handle))
        case .report(_):
            reportTarget = post
        }
    }
}

private struct PendingFeedRoute: Identifiable, Hashable {
    let id = UUID()
    let route: FeedRoute

    init(_ route: FeedRoute) {
        self.route = route
    }

    static func == (lhs: PendingFeedRoute, rhs: PendingFeedRoute) -> Bool {
        lhs.id == rhs.id
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }
}

struct AddMembersSheet: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    let listId: String
    var onAdded: () -> Void

    @State private var query = ""
    @State private var users: [UserSummary] = []
    @State private var selected: Set<String> = []
    @State private var isWorking = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Search by handle", text: $query)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .onSubmit { Task { await search() } }
                }
                Section("Results") {
                    if let errorMessage {
                        Text(errorMessage)
                            .font(TBTypography.caption)
                            .foregroundStyle(TBColor.danger)
                    }
                    ForEach(users) { user in
                        Button {
                            if selected.contains(user.id) { selected.remove(user.id) }
                            else { selected.insert(user.id) }
                        } label: {
                            HStack {
                                UserRowView(user: user)
                                if selected.contains(user.id) {
                                    HeroIcon(name: "check-solid", size: 16)
                                        .foregroundStyle(TBColor.accent)
                                }
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .navigationTitle("Add members")
            .navigationBarTitleDisplayMode(.inline)
            .scrollContentBackground(.hidden)
            .background(Color.clear)
            .presentationBackground(.ultraThinMaterial)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") { Task { await add() } }
                        .disabled(selected.isEmpty || isWorking)
                }
            }
        }
    }

    private func search() async {
        let q = query.trimmingCharacters(in: .whitespaces)
        guard q.count >= 2 else { return }
        do {
            let response: SearchResponse = try await env.api.get(API.Search.search(q))
            users = response.users
            errorMessage = nil
        } catch {
            errorMessage = "Could not search users."
        }
    }

    private func add() async {
        isWorking = true
        defer { isWorking = false }
        do {
            try await env.api.sendVoid(
                API.Lists.addMembers(listId),
                body: AddMembersBody(userIds: Array(selected))
            )
            env.toast.show("Members added")
            onAdded()
            dismiss()
        } catch {
            errorMessage = "Could not add members."
        }
    }
}
