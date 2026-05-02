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
                .foregroundStyle(.tint)
            Text("Pick a handle").font(.title2.weight(.semibold))
            Text("Your handle is how people find you. Letters, numbers, and underscores only.")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
                .padding(.horizontal)

            HStack {
                Text("@").foregroundStyle(.secondary)
                TextField("yourhandle", text: $handle)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
            }
            .padding()
            .background(Color(.secondarySystemBackground), in: .rect(cornerRadius: 12))
            .padding(.horizontal)

            if let errorMessage {
                Text(errorMessage).foregroundStyle(.red).font(.callout)
            }

            Button {
                Task { await submit() }
            } label: {
                if isSubmitting { ProgressView() }
                else { Text("Claim handle").frame(maxWidth: .infinity) }
            }
            .buttonStyle(.borderedProminent)
            .padding(.horizontal)
            .disabled(!isValid || isSubmitting)

            #if DEBUG
            Button("Seed + continue locally") {
                Task { await seedAndContinue() }
            }
            .buttonStyle(.bordered)
            #endif

            Button("Sign out", role: .destructive) {
                Task { await env.auth.signOut() }
            }
            Spacer()
        }
        .padding()
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
