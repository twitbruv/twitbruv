import SwiftUI

struct GroupSettingsView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss

    let conversation: Conversation

    @State private var newName = ""
    @State private var invites: [ConversationInvite] = []
    @State private var isWorking = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Members") {
                    ForEach(conversation.members ?? []) { user in
                        HStack {
                            UserRowView(user: user)
                            Spacer()
                            if conversation.isGroup == true {
                                Button(role: .destructive) {
                                    Task { await removeMember(user) }
                                } label: {
                                    HeroIcon(name: "trash-solid", size: 16)
                                        .foregroundStyle(TBColor.danger)
                                        .frame(width: TBLayout.hitTarget, height: TBLayout.hitTarget)
                                }
                                .buttonStyle(.plain)
                                .accessibilityLabel("Remove member")
                            }
                        }
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
                                if let value = invite.url ?? invite.token {
                                    ShareLink(item: value) {
                                        HeroIcon(name: "arrow-up-circle-solid", size: 16)
                                    }
                                    .buttonStyle(.plain)
                                    .accessibilityLabel("Share invite link")
                                    Button {
                                        UIPasteboard.general.string = value
                                        env.toast.show("Invite link copied")
                                    } label: {
                                        HeroIcon(name: "link-solid", size: 16)
                                    }
                                    .buttonStyle(.plain)
                                    .accessibilityLabel("Copy invite link")
                                }
                                Button(role: .destructive) {
                                    Task { await revokeInvite(invite) }
                                } label: {
                                    HeroIcon(name: "trash-solid", size: 16)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                }
                if let errorMessage {
                    Section {
                        Text(errorMessage)
                            .font(TBTypography.caption)
                            .foregroundStyle(TBColor.danger)
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
            env.toast.show("Group renamed")
            dismiss()
        } catch {
            errorMessage = "Could not rename group."
        }
    }

    private func loadInvites() async {
        do {
            let response: ConversationInvitesResponse = try await env.api.get(
                API.DMs.invites(conversation.id)
            )
            invites = response.invites
        } catch {
            errorMessage = "Could not load invites."
        }
    }

    private func createInvite() async {
        do {
            let response: CreateInviteResponse = try await env.api.send(
                API.DMs.createInvite(conversation.id),
                body: EmptyBody()
            )
            invites.insert(response.invite, at: 0)
            env.toast.show("Invite created")
        } catch {
            errorMessage = "Could not create invite."
        }
    }

    private func revokeInvite(_ invite: ConversationInvite) async {
        do {
            try await env.api.sendVoid(
                API.DMs.revokeInvite(conversation.id, inviteId: invite.id)
            )
            invites.removeAll { $0.id == invite.id }
            env.toast.show("Invite revoked")
        } catch {
            errorMessage = "Could not revoke invite."
        }
    }

    private func removeMember(_ user: UserSummary) async {
        isWorking = true
        defer { isWorking = false }
        do {
            try await env.api.sendVoid(
                API.DMs.removeMember(conversation.id, userId: user.id)
            )
            env.toast.show("Member removed")
        } catch {
            errorMessage = "Could not remove member."
        }
    }
}
