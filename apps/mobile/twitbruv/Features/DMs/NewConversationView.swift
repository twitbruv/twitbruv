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
    @State private var errorMessage: String?

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
                                    Image(systemName: "minus.circle")
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
                        .onSubmit { Task { await search() } }
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
                                        Image(systemName: "checkmark")
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
    }

    private func search() async {
        let q = query.trimmingCharacters(in: .whitespaces)
        guard q.count >= 2 else { return }
        do {
            let response: SearchResponse = try await env.api.get(API.Search.search(q))
            users = response.users
        } catch {
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
