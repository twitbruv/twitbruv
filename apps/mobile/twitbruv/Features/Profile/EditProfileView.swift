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
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Text("Profile")
                    .font(TBTypography.label)
                    .foregroundStyle(TBColor.textSecondary)

                TBTextField(title: "Display name", text: $displayName, contentType: .name)

                VStack(alignment: .leading, spacing: 6) {
                    Text("Bio")
                        .font(TBTypography.label)
                        .foregroundStyle(TBColor.textPrimary)
                    ZStack(alignment: .topLeading) {
                        TextField("", text: $bio, axis: .vertical)
                            .font(TBTypography.body)
                            .foregroundStyle(TBColor.textPrimary)
                            .lineLimit(2...6)
                            .padding(12)
                    }
                    .tbGlass(
                        .field,
                        in: RoundedRectangle(cornerRadius: TBLayout.radiusGlassCard, style: .continuous),
                        interactive: true,
                        shadow: false
                    )
                }

                TBTextField(title: "Location", text: $location)

                TBTextField(
                    title: "Website",
                    text: $website,
                    keyboard: .URL,
                    contentType: .URL,
                    autocap: .never
                )

                if let errorMessage {
                    Text(errorMessage)
                        .font(TBTypography.meta)
                        .foregroundStyle(TBColor.danger)
                }
            }
            .padding(TBLayout.pagePadding)
        }
        .background(Color.clear)
        .navigationTitle("Edit profile")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button("Save") { Task { await save() } }
                    .fontWeight(.semibold)
                    .foregroundStyle(TBColor.accent)
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

#if DEBUG
#Preview("Light") {
    NavigationStack {
        EditProfileView()
    }
    .tbPreview(authState: .signedIn(user: .preview), colorScheme: .light)
}

#Preview("Dark") {
    NavigationStack {
        EditProfileView()
    }
    .tbPreview(authState: .signedIn(user: .preview), colorScheme: .dark)
}
#endif
