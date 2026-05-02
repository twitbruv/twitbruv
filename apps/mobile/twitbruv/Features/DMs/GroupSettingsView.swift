import SwiftUI

struct GroupSettingsView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss

    let conversation: Conversation

    @State private var newName = ""
    @State private var invites: [ConversationInvite] = []
    @State private var isWorking = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Members") {
                    ForEach(conversation.members ?? []) { user in
                        UserRowView(user: user)
                    }
                }
                if conversation.isGroup == true {
                    Section("Rename") {
                        TextField(conversation.name ?? "Group name", text: $newName)
                        Button("Save") { Task { await rename() } }
                            .disabled(newName.isEmpty || isWorking)
                    }
                    Section("Invites") {
                        Button("Create invite link") { Task { await createInvite() } }
                        ForEach(invites) { invite in
                            HStack {
                                Text(invite.url ?? invite.token ?? "—")
                                    .font(.footnote)
                                    .lineLimit(1)
                                Spacer()
                                Button(role: .destructive) {
                                    Task { await revokeInvite(invite) }
                                } label: {
                                    Image(systemName: "trash")
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                }
            }
            .navigationTitle(conversation.name ?? "Conversation")
            .navigationBarTitleDisplayMode(.inline)
            .scrollContentBackground(.hidden)
            .background(Color.clear)
            .presentationBackground(.ultraThinMaterial)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                        .foregroundStyle(TBColor.accent)
                }
            }
            .task {
                if conversation.isGroup == true {
                    await loadInvites()
                }
            }
        }
    }

    private func rename() async {
        struct Body: Encodable { let name: String }
        isWorking = true
        defer { isWorking = false }
        do {
            try await env.api.sendVoid(API.DMs.rename(conversation.id), body: Body(name: newName))
            dismiss()
        } catch {}
    }

    private func loadInvites() async {
        do {
            let response: ConversationInvitesResponse = try await env.api.get(
                API.DMs.invites(conversation.id)
            )
            invites = response.invites
        } catch {}
    }

    private func createInvite() async {
        do {
            let response: CreateInviteResponse = try await env.api.send(
                API.DMs.createInvite(conversation.id),
                body: EmptyBody()
            )
            invites.insert(response.invite, at: 0)
        } catch {}
    }

    private func revokeInvite(_ invite: ConversationInvite) async {
        do {
            try await env.api.sendVoid(
                API.DMs.revokeInvite(conversation.id, inviteId: invite.id)
            )
            invites.removeAll { $0.id == invite.id }
        } catch {}
    }
}
