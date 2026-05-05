import SwiftUI

struct NewConversationView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss

    var onCreated: (Conversation?) -> Void

    @State private var query = ""
    @State private var selected: [UserSummary] = []
    @State private var groupName = ""
    @State private var users: [UserSummary] = []
    @State private var isCreating = false
    @State private var isSearching = false
    @State private var errorMessage: String?
    @State private var searchTask: Task<Void, Never>?

    var body: some View {
        NavigationStack {
            Form {
                if !selected.isEmpty {
                    Section("Selected") {
                        ForEach(selected) { user in
                            HStack {
                                UserRowView(user: user)
                                Button(role: .destructive) {
                                    selected.removeAll { $0.id == user.id }
                                } label: {
                                    HeroIcon(name: "minus-circle-outline", size: 18)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                }
                if selected.count > 1 {
                    Section("Group name (optional)") {
                        TextField("Name", text: $groupName)
                    }
                }
                Section {
                    TextField("Search by handle", text: $query)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .onSubmit { scheduleSearch(immediate: true) }
                        .onChange(of: query) { _, _ in
                            scheduleSearch(immediate: false)
                        }
                }
                if isSearching {
                    Section {
                        HStack(spacing: 12) {
                            ProgressView()
                            Text("Searching…")
                                .font(TBTypography.meta)
                                .foregroundStyle(TBColor.textSecondary)
                        }
                    }
                }
                if !users.isEmpty {
                    Section("Results") {
                        ForEach(users) { user in
                            Button {
                                if selected.contains(where: { $0.id == user.id }) {
                                    selected.removeAll { $0.id == user.id }
                                } else {
                                    selected.append(user)
                                }
                            } label: {
                                HStack {
                                    UserRowView(user: user)
                                    if selected.contains(where: { $0.id == user.id }) {
                                        HeroIcon(name: "check-solid", size: 16)
                                            .foregroundStyle(TBColor.accent)
                                    }
                                }
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                if let errorMessage {
                    Section {
                        Text(errorMessage)
                            .font(TBTypography.meta)
                            .foregroundStyle(TBColor.danger)
                    }
                }
            }
            .navigationTitle("New message")
            .navigationBarTitleDisplayMode(.inline)
            .scrollContentBackground(.hidden)
            .background(Color.clear)
            .presentationBackground(.ultraThinMaterial)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        onCreated(nil)
                        dismiss()
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Start") { Task { await create() } }
                        .disabled(selected.isEmpty || isCreating)
                }
            }
        }
        .onDisappear {
            searchTask?.cancel()
            searchTask = nil
        }
    }

    private func scheduleSearch(immediate: Bool) {
        searchTask?.cancel()
        searchTask = Task {
            if !immediate {
                try? await Task.sleep(for: .milliseconds(250))
            }
            await search()
        }
    }

    private func search() async {
        let q = query.trimmingCharacters(in: .whitespaces)
        guard q.count >= 2 else {
            isSearching = false
            users = []
            errorMessage = nil
            return
        }
        isSearching = true
        errorMessage = nil
        do {
            let response: SearchResponse = try await env.api.get(API.Search.search(q))
            guard !Task.isCancelled else { return }
            users = response.users
            isSearching = false
        } catch {
            guard !Task.isCancelled else { return }
            isSearching = false
            errorMessage = error.localizedDescription
        }
    }

    private func create() async {
        isCreating = true
        defer { isCreating = false }
        errorMessage = nil
        do {
            let response: ConversationDetailResponse = try await env.api.send(
                API.DMs.start(),
                body: StartDMBody(
                    userIds: selected.map(\.id),
                    name: groupName.isEmpty ? nil : groupName
                )
            )
            onCreated(response.conversation)
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
