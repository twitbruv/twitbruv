import PhotosUI
import SwiftUI

struct EditProfileView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss

    @State private var displayName = ""
    @State private var bio = ""
    @State private var location = ""
    @State private var website = ""
    @State private var avatarURL: String?
    @State private var bannerURL: String?
    @State private var avatarItems: [PhotosPickerItem] = []
    @State private var bannerItems: [PhotosPickerItem] = []
    @State private var avatarPicker = PhotoPickerController()
    @State private var bannerPicker = PhotoPickerController()
    @State private var isSaving = false
    @State private var errorMessage: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Text("Profile")
                    .font(TBTypography.label)
                    .foregroundStyle(TBColor.textSecondary)

                VStack(alignment: .leading, spacing: 12) {
                    Text("Images")
                        .font(TBTypography.label)
                        .foregroundStyle(TBColor.textPrimary)
                    ZStack(alignment: .bottomLeading) {
                        bannerPreview
                            .frame(height: 120)
                            .frame(maxWidth: .infinity)
                            .clipShape(RoundedRectangle(cornerRadius: TBLayout.radiusLG, style: .continuous))
                        avatarPreview
                            .frame(width: 72, height: 72)
                            .clipShape(Circle())
                            .overlay {
                                Circle().strokeBorder(TBColor.base1, lineWidth: 3)
                            }
                            .padding(12)
                    }
                    HStack(spacing: 10) {
                        PhotosPicker(
                            selection: $avatarItems,
                            maxSelectionCount: 1,
                            matching: .images
                        ) {
                            Label("Avatar", hero: "camera-solid")
                        }
                        .buttonStyle(.plain)
                        .onChange(of: avatarItems) { _, items in
                            Task { await avatarPicker.ingest(items) }
                        }
                        PhotosPicker(
                            selection: $bannerItems,
                            maxSelectionCount: 1,
                            matching: .images
                        ) {
                            Label("Banner", hero: "photo-solid")
                        }
                        .buttonStyle(.plain)
                        .onChange(of: bannerItems) { _, items in
                            Task { await bannerPicker.ingest(items) }
                        }
                    }
                    .font(TBTypography.meta.weight(.medium))
                    .foregroundStyle(TBColor.accent)
                }
                .padding(14)
                .tbGlass(
                    .panel,
                    in: RoundedRectangle(cornerRadius: TBLayout.radiusGlassPanel, style: .continuous)
                )

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
                avatarURL = user.avatarUrl
                bannerURL = user.bannerUrl
            }
        }
    }

    @ViewBuilder
    private var avatarPreview: some View {
        if let picked = avatarPicker.picked.first,
           let image = UIImage(data: picked.data)
        {
            Image(uiImage: image)
                .resizable()
                .scaledToFill()
        } else {
            AvatarView(
                urlString: avatarURL,
                size: 72,
                fallbackInitial: displayName.isEmpty ? env.auth.currentUser?.handle : displayName
            )
        }
    }

    @ViewBuilder
    private var bannerPreview: some View {
        if let picked = bannerPicker.picked.first,
           let image = UIImage(data: picked.data)
        {
            Image(uiImage: image)
                .resizable()
                .scaledToFill()
        } else if let bannerURL, let url = URL(string: bannerURL) {
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let image):
                    image.resizable().scaledToFill()
                default:
                    TBColor.base2
                }
            }
        } else {
            TBColor.base2
                .overlay {
                    HeroIcon(name: "photo-solid", size: 28)
                        .foregroundStyle(TBColor.textTertiary)
                }
        }
    }

    private func save() async {
        isSaving = true
        defer { isSaving = false }
        errorMessage = nil
        do {
            let uploader = MediaUploader(api: env.api)
            var nextAvatarURL = avatarURL
            if let avatar = avatarPicker.picked.first {
                let media = try await uploader.upload(data: avatar.data, mimeType: avatar.mime)
                nextAvatarURL = media.bestURL?.absoluteString
            }
            var nextBannerURL = bannerURL
            if let banner = bannerPicker.picked.first {
                let media = try await uploader.upload(data: banner.data, mimeType: banner.mime)
                nextBannerURL = media.bestURL?.absoluteString
            }
            try await env.auth.updateProfile(
                AuthStore.UpdateProfileBody(
                    displayName: displayName,
                    bio: bio,
                    location: location,
                    websiteUrl: website,
                    avatarUrl: nextAvatarURL,
                    bannerUrl: nextBannerURL
                )
            )
            env.toast.show("Profile updated")
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
