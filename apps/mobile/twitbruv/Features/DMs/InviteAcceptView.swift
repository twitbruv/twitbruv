import SwiftUI

struct InviteAcceptView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss

    let token: String

    @State private var preview: InvitePreviewResponse?
    @State private var isAccepting = false
    @State private var errorMessage: String?

    var body: some View {
        VStack(spacing: 20) {
            if let preview {
                if let conv = preview.conversation {
                    Text(conv.name ?? "Group invite")
                        .font(.title2.weight(.semibold))
                }
                if let inviter = preview.inviter {
                    Text("Invited by @\(inviter.handle ?? "—")")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                }
                if let n = preview.memberCount {
                    Text("\(n) members").font(.callout).foregroundStyle(.secondary)
                }
                Spacer()
                Button {
                    Task { await accept() }
                } label: {
                    if isAccepting {
                        ProgressView()
                    } else {
                        Text(preview.alreadyMember == true ? "Open" : "Accept")
                            .frame(maxWidth: .infinity)
                    }
                }
                .buttonStyle(.borderedProminent)
                .padding(.horizontal)
            } else {
                ProgressView()
            }
            if let errorMessage {
                Text(errorMessage).foregroundStyle(.red).font(.callout)
            }
        }
        .padding()
        .navigationTitle("Invite")
        .task {
            await load()
        }
    }

    private func load() async {
        do {
            preview = try await env.api.get(API.Invites.preview(token))
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func accept() async {
        isAccepting = true
        defer { isAccepting = false }
        do {
            try await env.api.sendVoid(API.Invites.accept(token))
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
