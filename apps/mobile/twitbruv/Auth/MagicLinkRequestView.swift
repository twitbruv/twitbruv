import SwiftUI

struct MagicLinkRequestView: View {
    @Environment(AppEnvironment.self) private var env

    @State private var email = ""
    @State private var isSubmitting = false
    @State private var status: String?

    var body: some View {
        Form {
            Section {
                TextField("Email", text: $email)
                    .textContentType(.emailAddress)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
            } footer: {
                Text(
                    "Open the link from the same device. Once your session is set, return to the app and tap continue."
                )
            }

            if let status {
                Section {
                    Text(status).font(.callout)
                }
            }

            Section {
                Button {
                    Task { await submit() }
                } label: {
                    if isSubmitting {
                        ProgressView()
                    } else {
                        Text("Send magic link").frame(maxWidth: .infinity)
                    }
                }
                .buttonStyle(.borderedProminent)
                .disabled(!email.contains("@") || isSubmitting)

                Button("I've signed in — continue") {
                    Task { await env.auth.bootstrap() }
                }
            }
        }
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
