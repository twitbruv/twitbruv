import SwiftUI

struct MagicLinkRequestView: View {
    @Environment(AppEnvironment.self) private var env

    @State private var email = ""
    @State private var isSubmitting = false
    @State private var status: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                TBTextField(
                    title: "Email",
                    text: $email,
                    keyboard: .emailAddress,
                    contentType: .emailAddress,
                    autocap: .never
                )

                Text(
                    "Open the link from the same device. Once your session is set, return to the app and tap continue."
                )
                .font(TBTypography.caption)
                .foregroundStyle(TBColor.textSecondary)

                if let status {
                    Text(status)
                        .font(TBTypography.meta)
                        .foregroundStyle(TBColor.textPrimary)
                }

                TBButton(
                    title: "Send magic link",
                    style: .primary,
                    expands: true,
                    isLoading: isSubmitting,
                    isDisabled: !email.contains("@")
                ) {
                    Task { await submit() }
                }

                TBButton(
                    title: "I've signed in — continue",
                    style: .outline,
                    expands: true
                ) {
                    Task { await env.auth.bootstrap() }
                }
            }
            .padding(TBLayout.pagePadding)
        }
        .background(TBColor.base1)
        .navigationTitle("Magic link")
    }

    private func submit() async {
        status = nil
        isSubmitting = true
        defer { isSubmitting = false }
        do {
            try await env.auth.requestMagicLink(email: email)
            status = "Check your inbox."
        } catch {
            status = "Couldn't send right now."
        }
    }
}
