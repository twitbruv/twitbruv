import SwiftUI

struct TwoFactorChallengeView: View {
    @Environment(AppEnvironment.self) private var env

    @State private var code = ""
    @State private var useBackup = false
    @State private var isSubmitting = false
    @State private var errorMessage: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Toggle("Use backup code", isOn: $useBackup)
                    .tint(TBColor.inverse)
                ZStack(alignment: .leading) {
                    TextField(
                        useBackup ? "Backup code" : "6-digit code",
                        text: $code
                    )
                    .font(TBTypography.body)
                    .foregroundStyle(TBColor.textPrimary)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .keyboardType(useBackup ? .default : .numberPad)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                }
                .frame(minHeight: 40)
                .tbGlass(
                    .field,
                    in: RoundedRectangle(cornerRadius: TBLayout.radiusGlassCard, style: .continuous),
                    interactive: true,
                    shadow: false
                )

                if let errorMessage {
                    Text(errorMessage)
                        .font(TBTypography.meta)
                        .foregroundStyle(TBColor.danger)
                }

                TBButton(
                    title: "Verify",
                    style: .primary,
                    expands: true,
                    isLoading: isSubmitting,
                    isDisabled: code.isEmpty
                ) {
                    Task { await submit() }
                }
            }
            .padding(TBLayout.pagePadding)
        }
        .background(Color.clear)
        .navigationTitle("Two-factor")
        .navigationBarTitleDisplayMode(.inline)
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

#if DEBUG
#Preview("Light") {
    NavigationStack {
        TwoFactorChallengeView()
    }
    .tbPreview(
        authState: .signedOut,
        colorScheme: .light,
        pendingTwoFactor: TwoFactorPending(email: "preview@example.com")
    )
}

#Preview("Dark") {
    NavigationStack {
        TwoFactorChallengeView()
    }
    .tbPreview(
        authState: .signedOut,
        colorScheme: .dark,
        pendingTwoFactor: TwoFactorPending(email: "preview@example.com")
    )
}
#endif
