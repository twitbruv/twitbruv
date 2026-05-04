import SwiftUI

struct SignInView: View {
    @Environment(AppEnvironment.self) private var env
    @Binding var path: NavigationPath

    @State private var email = ""
    @State private var password = ""
    @State private var isSubmitting = false
    @State private var errorMessage: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                TBTextField(
                    title: "Email",
                    text: $email,
                    placeholder: "Email",
                    keyboard: .emailAddress,
                    contentType: .emailAddress,
                    autocap: .never
                )
                TBSecureField(title: "Password", text: $password, placeholder: "Password")

                if let errorMessage {
                    Text(errorMessage)
                        .font(TBTypography.meta)
                        .foregroundStyle(TBColor.danger)
                }

                TBButton(
                    title: "Sign in",
                    style: .primary,
                    expands: true,
                    isLoading: isSubmitting,
                    isDisabled: !isValid
                ) {
                    Task { await submit() }
                }

//                VStack(alignment: .leading, spacing: 10) {
//                    NavigationLink {
//                        MagicLinkRequestView()
//                    } label: {
//                        linkLabel("Forgot password? Use a magic link")
//                    }
//                    NavigationLink {
//                        OAuthSignInView(provider: "github")
//                    } label: {
//                        linkLabel("Sign in with GitHub")
//                    }
//                    NavigationLink {
//                        OAuthSignInView(provider: "google")
//                    } label: {
//                        linkLabel("Sign in with Google")
//                    }
//                    NavigationLink {
//                        OAuthSignInView(provider: "gitlab")
//                    } label: {
//                        linkLabel("Sign in with GitLab")
//                    }
//                }

                NavigationLink {
                    SignUpView(path: $path)
                } label: {
                    Text("Create an account")
                        .font(TBTypography.meta.weight(.medium))
                        .foregroundStyle(TBColor.textPrimary)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(TBColor.base2, in: Capsule(style: .continuous))
                        .overlay {
                            Capsule(style: .continuous)
                                .strokeBorder(TBColor.borderNeutral, lineWidth: 1)
                        }
                }
                .buttonStyle(.plain)
            }
            .padding(TBLayout.pagePadding)
        }
        .background(Color.clear)
        .navigationTitle("Sign in")
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(isPresented: Binding(
            get: { env.auth.pendingTwoFactor != nil },
            set: { if !$0 { env.auth.pendingTwoFactor = nil } }
        )) {
            TwoFactorChallengeView()
        }
    }

    private func linkLabel(_ s: String) -> some View {
        HStack {
            Text(s)
                .font(TBTypography.bodySecondary)
                .foregroundStyle(TBColor.accent)
            Spacer()
            Image(systemName: "chevron.right")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(TBColor.textTertiary)
        }
        .padding(.vertical, 4)
    }

    private var isValid: Bool {
        !email.trimmingCharacters(in: .whitespaces).isEmpty
            && password.count >= 1
    }

    private func submit() async {
        errorMessage = nil
        isSubmitting = true
        defer { isSubmitting = false }
        do {
            try await env.auth.signInEmail(email: email, password: password)
        } catch let APIError.http(_, _, message) {
            errorMessage = message ?? "Couldn't sign you in."
        } catch let APIError.forbidden(code) {
            errorMessage = code ?? "Forbidden."
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

#if DEBUG
#Preview("Light") {
    NavigationStack {
        SignInView(path: .constant(NavigationPath()))
    }
    .tbPreview(authState: .signedOut, colorScheme: .light)
}

#Preview("Dark") {
    NavigationStack {
        SignInView(path: .constant(NavigationPath()))
    }
    .tbPreview(authState: .signedOut, colorScheme: .dark)
}
#endif
