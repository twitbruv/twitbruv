import SwiftUI

struct EmailVerifyPendingView: View {
    @Environment(AppEnvironment.self) private var env

    @State private var isResending = false
    @State private var resendMessage: String?
    @State private var isChecking = false

    private var email: String {
        if case .needsEmailVerification(let email) = env.auth.state {
            return email
        }
        return env.auth.currentUser?.email ?? ""
    }

    var body: some View {
        VStack(spacing: 24) {
            Spacer()
            HeroIcon(name: "envelope-open-solid", size: 56)
                .foregroundStyle(TBColor.accent)

            Text("Verify your email")
                .font(TBTypography.pageTitle)
                .foregroundStyle(TBColor.textPrimary)

            Text(
                email.isEmpty
                    ? "Tap the link we sent to your email to continue."
                    : "We sent a verification link to \(email). Tap it to continue."
            )
            .multilineTextAlignment(.center)
            .font(TBTypography.bodySecondary)
            .foregroundStyle(TBColor.textSecondary)
            .padding(.horizontal)

            if let resendMessage {
                Text(resendMessage)
                    .font(TBTypography.meta)
                    .foregroundStyle(TBColor.textSecondary)
            }

            Spacer()

            VStack(spacing: 12) {
                #if DEBUG
                TBButton(
                    title: "Seed + continue locally",
                    style: .primary,
                    expands: true,
                    isLoading: env.devTools.isSeeding
                ) {
                    Task { await seedAndContinue() }
                }
                #endif

                TBButton(
                    title: "I've verified — continue",
                    style: .primary,
                    expands: true,
                    isLoading: isChecking
                ) {
                    Task { await checkAgain() }
                }

                TBButton(
                    title: "Resend verification email",
                    style: .outline,
                    expands: true,
                    isLoading: isResending,
                    isDisabled: email.isEmpty
                ) {
                    Task { await resend() }
                }

                TBButton(
                    title: "Sign out",
                    style: .dangerLight,
                    expands: true
                ) {
                    Task { await env.auth.signOut() }
                }
            }
            .padding(.horizontal, TBLayout.pagePadding)
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.clear)
    }

    private func resend() async {
        guard !email.isEmpty else { return }
        resendMessage = nil
        isResending = true
        defer { isResending = false }
        do {
            try await env.auth.resendVerificationEmail(email: email)
            resendMessage = "Sent."
        } catch {
            resendMessage = "Couldn't resend right now."
        }
    }

    private func checkAgain() async {
        isChecking = true
        defer { isChecking = false }
        await env.auth.refreshAfterVerification()
    }

    #if DEBUG
    private func seedAndContinue() async {
        let seeded = await env.devTools.seedLocalData()
        if seeded {
            await env.auth.bootstrap()
        }
    }
    #endif
}

#if DEBUG
#Preview("Light") {
    EmailVerifyPendingView()
        .tbPreview(
            authState: .needsEmailVerification(email: "preview@example.com"),
            colorScheme: .light
        )
}

#Preview("Dark") {
    EmailVerifyPendingView()
        .tbPreview(
            authState: .needsEmailVerification(email: "preview@example.com"),
            colorScheme: .dark
        )
}
#endif
