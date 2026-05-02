import SwiftUI

struct EditProfileView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss

    @State private var displayName = ""
    @State private var bio = ""
    @State private var location = ""
    @State private var website = ""
    @State private var isSaving = false
    @State private var errorMessage: String?

    var body: some View {
        Form {
            Section("Profile") {
                TextField("Display name", text: $displayName)
                TextField("Bio", text: $bio, axis: .vertical)
                    .lineLimit(2...6)
                TextField("Location", text: $location)
                TextField("Website", text: $website)
                    .keyboardType(.URL)
                    .textInputAutocapitalization(.never)
            }

            if let errorMessage {
                Section {
                    Text(errorMessage).foregroundStyle(.red)
                }
            }
        }
        .navigationTitle("Edit profile")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button("Save") { Task { await save() } }
                    .disabled(isSaving)
            }
        }
        .task {
            if let user = env.auth.currentUser {
                displayName = user.displayName ?? ""
                bio = user.bio ?? ""
                location = user.location ?? ""
                website = user.websiteUrl ?? ""
            }
        }
    }

    private func save() async {
        isSaving = true
        defer { isSaving = false }
        errorMessage = nil
        do {
            try await env.auth.updateProfile(
                AuthStore.UpdateProfileBody(
                    displayName: displayName,
                    bio: bio,
                    location: location,
                    websiteUrl: website
                )
            )
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
