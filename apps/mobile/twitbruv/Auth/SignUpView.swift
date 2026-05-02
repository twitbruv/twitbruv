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
        Form {
            Section("Account") {
                TextField("Email", text: $email)
                    .textContentType(.emailAddress)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                SecureField("Password (10+ characters)", text: $password)
                    .textContentType(.newPassword)
                TextField("Display name (optional)", text: $displayName)
                    .textContentType(.name)
            }

            if let errorMessage {
                Section {
                    Text(errorMessage).foregroundStyle(.red).font(.callout)
                }
            }

            Section {
                Button {
                    Task { await submit() }
                } label: {
                    if isSubmitting {
                        ProgressView()
                    } else {
                        Text("Create account").frame(maxWidth: .infinity)
                    }
                }
                .buttonStyle(.borderedProminent)
                .disabled(!isValid || isSubmitting)
            }

            Section {
                Text(
                    "After creating your account you'll need to verify your email and pick a handle."
                )
                .font(.footnote)
                .foregroundStyle(.secondary)
            }
        }
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
