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
        VStack(spacing: 20) {
            Spacer()
            Image(systemName: "envelope.badge")
                .font(.system(size: 56))
                .foregroundStyle(.tint)

            Text("Verify your email")
                .font(.title2.weight(.semibold))

            Text(
                email.isEmpty
                    ? "Tap the link we sent to your email to continue."
                    : "We sent a verification link to \(email). Tap it to continue."
            )
            .multilineTextAlignment(.center)
            .padding(.horizontal)
            .foregroundStyle(.secondary)

            if let resendMessage {
                Text(resendMessage)
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            VStack(spacing: 12) {
                #if DEBUG
                Button {
                    Task { await seedAndContinue() }
                } label: {
                    if env.devTools.isSeeding {
                        ProgressView()
                    } else {
                        Text("Seed + continue locally").frame(maxWidth: .infinity)
                    }
                }
                .buttonStyle(.borderedProminent)
                #endif

                Button {
                    Task { await checkAgain() }
                } label: {
                    if isChecking {
                        ProgressView()
                    } else {
                        Text("I've verified — continue").frame(maxWidth: .infinity)
                    }
                }
                .buttonStyle(.borderedProminent)
                .disabled(isChecking)

                Button {
                    Task { await resend() }
                } label: {
                    if isResending {
                        ProgressView()
                    } else {
                        Text("Resend verification email").frame(maxWidth: .infinity)
                    }
                }
                .buttonStyle(.bordered)
                .disabled(isResending || email.isEmpty)

                Button("Sign out", role: .destructive) {
                    Task { await env.auth.signOut() }
                }
            }
            .padding(.horizontal)
        }
        .padding()
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
