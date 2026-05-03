import SwiftUI

struct MyListsView: View {
    @Environment(AppEnvironment.self) private var env

    @State private var lists: [UserList] = []
    @State private var isLoading = false
    @State private var showCreate = false
    @State private var newName = ""
    @State private var newDescription = ""
    @State private var newVisibility = "public"

    var body: some View {
        List {
            if lists.isEmpty && !isLoading {
                EmptyStateView(
                    icon: "list.bullet.rectangle",
                    title: "No lists yet",
                    message: "Create a list to organize accounts you follow."
                )
                .listRowSeparator(.hidden)
            }
            ForEach(lists) { list in
                NavigationLink {
                    ListDetailView(list: list)
                } label: {
                    HStack {
                        Image(systemName: "list.bullet.rectangle")
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
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(Color.clear)
        .navigationTitle("Lists")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { showCreate = true } label: {
                    Image(systemName: "plus")
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
        } catch {}
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
        } catch {}
    }
}

struct ListDetailView: View {
    @Environment(AppEnvironment.self) private var env
    let list: UserList

    @State private var members: [UserSummary] = []
    @State private var loader: PagedLoader<Post, PostsResponse>?
    @State private var tab: ListTab = .timeline
    @State private var showAdd = false

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
                        ForEach(loader.items) { post in
                            PostCardView(post: post)
                                .listRowInsets(EdgeInsets())
                        }
                        LoadMoreFooter(
                            hasMore: loader.nextCursor != nil,
                            isLoading: loader.isLoading
                        ) { await loader.loadMore() }
                    case .members:
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
                ProgressView()
                    .tint(TBColor.accent)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Color.clear)
                    .task { await setup() }
            }
        }
        .navigationTitle(list.name)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { showAdd = true } label: {
                    Image(systemName: "person.crop.circle.badge.plus")
                        .foregroundStyle(TBColor.accent)
                }
            }
        }
        .sheet(isPresented: $showAdd) {
            AddMembersSheet(listId: list.id) {
                Task { await loadMembers() }
            }
        }
    }

    enum ListTab: Hashable { case timeline, members }

    private func setup() async {
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
        } catch {}
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
                    ForEach(users) { user in
                        Button {
                            if selected.contains(user.id) { selected.remove(user.id) }
                            else { selected.insert(user.id) }
                        } label: {
                            HStack {
                                UserRowView(user: user)
                                if selected.contains(user.id) {
                                    Image(systemName: "checkmark")
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
        } catch {}
    }

    private func add() async {
        isWorking = true
        defer { isWorking = false }
        do {
            try await env.api.sendVoid(
                API.Lists.addMembers(listId),
                body: AddMembersBody(userIds: Array(selected))
            )
            onAdded()
            dismiss()
        } catch {}
    }
}
