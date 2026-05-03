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
                        .font(TBTypography.pageTitle)
                        .foregroundStyle(TBColor.textPrimary)
                }
                if let inviter = preview.inviter {
                    Text("Invited by @\(inviter.handle ?? "—")")
                        .font(TBTypography.bodySecondary)
                        .foregroundStyle(TBColor.textSecondary)
                }
                if let n = preview.memberCount {
                    Text("\(n) members")
                        .font(TBTypography.bodySecondary)
                        .foregroundStyle(TBColor.textSecondary)
                }
                Spacer()
                TBButton(
                    title: preview.alreadyMember == true ? "Open" : "Accept",
                    style: .primary,
                    expands: true,
                    isLoading: isAccepting
                ) {
                    Task { await accept() }
                }
                .padding(.horizontal, TBLayout.pagePadding)
            } else {
                ProgressView()
                    .tint(TBColor.accent)
            }
            if let errorMessage {
                Text(errorMessage)
                    .foregroundStyle(TBColor.danger)
                    .font(TBTypography.meta)
            }
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.clear)
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
