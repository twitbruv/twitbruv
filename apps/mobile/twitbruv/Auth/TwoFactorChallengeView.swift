import SwiftUI

struct TwoFactorChallengeView: View {
    @Environment(AppEnvironment.self) private var env

    @State private var code = ""
    @State private var useBackup = false
    @State private var isSubmitting = false
    @State private var errorMessage: String?

    var body: some View {
        Form {
            Section {
                Toggle("Use backup code", isOn: $useBackup)
                TextField(
                    useBackup ? "Backup code" : "6-digit code",
                    text: $code
                )
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .keyboardType(useBackup ? .default : .numberPad)
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
                    if isSubmitting { ProgressView() }
                    else { Text("Verify").frame(maxWidth: .infinity) }
                }
                .buttonStyle(.borderedProminent)
                .disabled(code.isEmpty || isSubmitting)
            }
        }
        .navigationTitle("Two-factor")
    }

    private func submit() async {
        errorMessage = nil
        isSubmitting = true
        defer { isSubmitting = false }
        do {
            if useBackup {
                try await env.auth.submitTwoFactorBackup(code)
            } else {
                try await env.auth.submitTwoFactorTOTP(code)
            }
        } catch let APIError.http(_, _, message) {
            errorMessage = message ?? "Verification failed."
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
