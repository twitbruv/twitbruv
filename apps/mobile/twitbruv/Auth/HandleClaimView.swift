import SwiftUI

struct HandleClaimView: View {
    @Environment(AppEnvironment.self) private var env

    @State private var handle = ""
    @State private var isSubmitting = false
    @State private var errorMessage: String?

    var body: some View {
        VStack(spacing: 24) {
            Spacer()
            Image(systemName: "person.text.rectangle")
                .font(.system(size: 56))
                .foregroundStyle(TBColor.accent)
            Text("Pick a handle")
                .font(TBTypography.pageTitle)
                .foregroundStyle(TBColor.textPrimary)
            Text("Your handle is how people find you. Letters, numbers, and underscores only.")
                .multilineTextAlignment(.center)
                .font(TBTypography.bodySecondary)
                .foregroundStyle(TBColor.textSecondary)
                .padding(.horizontal)

            HStack(spacing: 8) {
                Text("@")
                    .font(TBTypography.body)
                    .foregroundStyle(TBColor.textSecondary)
                TextField("yourhandle", text: $handle)
                    .font(TBTypography.body)
                    .foregroundStyle(TBColor.textPrimary)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .tbGlass(
                .field,
                in: RoundedRectangle(cornerRadius: TBLayout.radiusGlassCard, style: .continuous),
                interactive: true,
                shadow: false
            )
            .padding(.horizontal, TBLayout.pagePadding)

            if let errorMessage {
                Text(errorMessage)
                    .font(TBTypography.meta)
                    .foregroundStyle(TBColor.danger)
                    .padding(.horizontal)
            }

            TBButton(
                title: "Claim handle",
                style: .primary,
                expands: true,
                isLoading: isSubmitting,
                isDisabled: !isValid
            ) {
                Task { await submit() }
            }
            .padding(.horizontal, TBLayout.pagePadding)

            #if DEBUG
            TBButton(
                title: "Seed + continue locally",
                style: .outline,
                expands: true
            ) {
                Task { await seedAndContinue() }
            }
            .padding(.horizontal, TBLayout.pagePadding)
            #endif

            TBButton(
                title: "Sign out",
                style: .dangerLight,
                expands: true
            ) {
                Task { await env.auth.signOut() }
            }
            .padding(.horizontal, TBLayout.pagePadding)

            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.clear)
    }

    private var isValid: Bool {
        let trimmed = handle.trimmingCharacters(in: .whitespaces)
        guard trimmed.count >= 2 && trimmed.count <= 20 else { return false }
        return trimmed.allSatisfy {
            $0.isLetter || $0.isNumber || $0 == "_"
        }
    }

    private func submit() async {
        errorMessage = nil
        isSubmitting = true
        defer { isSubmitting = false }
        do {
            try await env.auth.claimHandle(handle.trimmingCharacters(in: .whitespaces))
        } catch let APIError.http(_, code, _) {
            switch code {
            case "handle_taken": errorMessage = "That handle is taken."
            case "reserved_handle": errorMessage = "That handle is reserved."
            default: errorMessage = code ?? "Couldn't claim that handle."
            }
        } catch {
            errorMessage = error.localizedDescription
        }
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
    HandleClaimView()
        .tbPreview(authState: .needsHandle(user: .previewNeedsHandle), colorScheme: .light)
}

#Preview("Dark") {
    HandleClaimView()
        .tbPreview(authState: .needsHandle(user: .previewNeedsHandle), colorScheme: .dark)
}
#endif
