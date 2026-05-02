import SwiftUI

struct SignUpView: View {
    @Environment(AppEnvironment.self) private var env
    @Binding var path: NavigationPath

    @State private var email = ""
    @State private var password = ""
    @State private var displayName = ""
    @State private var isSubmitting = false
    @State private var errorMessage: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Text("Account")
                    .font(TBTypography.label)
                    .foregroundStyle(TBColor.textSecondary)

                TBTextField(
                    title: "Email",
                    text: $email,
                    keyboard: .emailAddress,
                    contentType: .emailAddress,
                    autocap: .never
                )
                TBSecureField(title: "Password (10+ characters)", text: $password)
                TBTextField(
                    title: "Display name (optional)",
                    text: $displayName,
                    contentType: .name,
                    autocap: .words
                )

                if let errorMessage {
                    Text(errorMessage)
                        .font(TBTypography.meta)
                        .foregroundStyle(TBColor.danger)
                }

                TBButton(
                    title: "Create account",
                    style: .primary,
                    expands: true,
                    isLoading: isSubmitting,
                    isDisabled: !isValid
                ) {
                    Task { await submit() }
                }

                Text(
                    "After creating your account you'll need to verify your email and pick a handle."
                )
                .font(TBTypography.caption)
                .foregroundStyle(TBColor.textSecondary)
            }
            .padding(TBLayout.pagePadding)
        }
        .background(TBColor.base1)
        .navigationTitle("Sign up")
    }

    private var isValid: Bool {
        password.count >= 10
            && email.contains("@")
    }

    private func submit() async {
        errorMessage = nil
        isSubmitting = true
        defer { isSubmitting = false }
        do {
            try await env.auth.signUpEmail(
                email: email, password: password,
                displayName: displayName.isEmpty ? nil : displayName
            )
        } catch let APIError.http(_, _, message) {
            errorMessage = message ?? "Couldn't create your account."
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
