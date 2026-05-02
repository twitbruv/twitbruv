import SwiftUI

struct SignInView: View {
    @Environment(AppEnvironment.self) private var env
    @Binding var path: NavigationPath

    @State private var email = ""
    @State private var password = ""
    @State private var isSubmitting = false
    @State private var errorMessage: String?

    var body: some View {
        Form {
            Section {
                TextField("Email", text: $email)
                    .textContentType(.emailAddress)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                SecureField("Password", text: $password)
                    .textContentType(.password)
            }

            if let errorMessage {
                Section {
                    Text(errorMessage)
                        .foregroundStyle(.red)
                        .font(.callout)
                }
            }

            Section {
                Button {
                    Task { await submit() }
                } label: {
                    if isSubmitting {
                        ProgressView()
                    } else {
                        Text("Sign in")
                            .frame(maxWidth: .infinity)
                    }
                }
                .buttonStyle(.borderedProminent)
                .disabled(!isValid || isSubmitting)
            }

            Section {
                NavigationLink("Forgot password? Use a magic link") {
                    MagicLinkRequestView()
                }
                NavigationLink("Sign in with GitHub") {
                    OAuthSignInView(provider: "github")
                }
                NavigationLink("Sign in with Google") {
                    OAuthSignInView(provider: "google")
                }
                NavigationLink("Sign in with GitLab") {
                    OAuthSignInView(provider: "gitlab")
                }
            }

            Section {
                NavigationLink {
                    SignUpView(path: $path)
                } label: {
                    Text("Create an account")
                        .frame(maxWidth: .infinity)
                }
            }
        }
        .navigationTitle("Sign in")
        .navigationDestination(isPresented: Binding(
            get: { env.auth.pendingTwoFactor != nil },
            set: { if !$0 { env.auth.pendingTwoFactor = nil } }
        )) {
            TwoFactorChallengeView()
        }
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
