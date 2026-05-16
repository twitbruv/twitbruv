import SwiftUI
import UIKit

struct MyProfileView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(AuthStore.self) private var auth

    @State private var navigationPath = NavigationPath()

    var body: some View {
        Group {
            if let handle = auth.currentUser?.handle, !handle.isEmpty {
                NavigationStack(path: $navigationPath) {
                    ProfileView(handle: handle, navigationPath: $navigationPath)
                }
            } else {
                NavigationStack {
                    VStack(spacing: 12) {
                        Text("No handle set.")
                            .font(TBTypography.bodySecondary)
                            .foregroundStyle(TBColor.textSecondary)
                        NavigationLink("Settings / diagnostics") {
                            SettingsView()
                        }
                        .foregroundStyle(TBColor.accent)
                    }
                }
            }
        }
    }
}

struct SettingsView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(AuthStore.self) private var auth
    @Environment(\.openURL) private var openURL
    @State private var isSigningOut = false

    var body: some View {
        List {
            Section("Notifications") {
                Button {
                    if let url = URL(string: UIApplication.openSettingsURLString) {
                        openURL(url)
                    }
                } label: {
                    SettingsRow(icon: "bell-solid", title: "System notification settings")
                }
                .buttonStyle(.plain)
            }

            Section("Library") {
                NavigationLink { BookmarksView() } label: {
                    SettingsRow(icon: "bookmark-solid", title: "Bookmarks")
                }
                NavigationLink { MyListsView() } label: {
                    SettingsRow(icon: "queue-list-solid", title: "Lists")
                }
                NavigationLink { ScheduledPostsView() } label: {
                    SettingsRow(icon: "calendar-solid", title: "Scheduled")
                }
            }

            Section("Privacy") {
                NavigationLink {
                    UsersListView(title: "Blocked", endpoint: { cursor in
                        API.Me.blocks(cursor: cursor)
                    })
                } label: {
                    SettingsRow(icon: "hand-raised-solid", title: "Blocked accounts")
                }
                NavigationLink {
                    UsersListView(title: "Muted", endpoint: { cursor in
                        API.Me.mutes(cursor: cursor)
                    })
                } label: {
                    SettingsRow(icon: "speaker-xmark-solid", title: "Muted accounts")
                }
            }

            Section("Account") {
                NavigationLink { EditProfileView() } label: {
                    SettingsRow(icon: "user-circle-solid", title: "Edit profile")
                }
                #if DEBUG
                NavigationLink {
                    DevDiagnosticsView()
                } label: {
                    SettingsRow(icon: "wrench-screwdriver-solid", title: "API diagnostics")
                }
                Button {
                    Task { _ = await env.devTools.seedLocalData() }
                } label: {
                    if env.devTools.isSeeding {
                        ProgressView()
                    } else {
                        SettingsRow(icon: "sparkles-solid", title: "Seed local data")
                    }
                }
                .buttonStyle(.plain)
                #endif
                Button(role: .destructive) {
                    Task {
                        isSigningOut = true
                        await auth.signOut()
                        isSigningOut = false
                    }
                } label: {
                    if isSigningOut { ProgressView() }
                    else {
                        SettingsRow(icon: "arrow-left-solid", title: "Sign out", tint: TBColor.danger)
                    }
                }
                .buttonStyle(.plain)
            }
        }
        .navigationTitle("Settings")
        .tbListChrome()
    }
}

private struct SettingsRow: View {
    let icon: String
    let title: String
    var tint: Color = TBColor.accent

    var body: some View {
        HStack(spacing: 12) {
            HeroIcon(name: icon, size: 18)
                .foregroundStyle(tint)
                .frame(width: TBLayout.hitTarget, height: TBLayout.hitTarget)
                .tbGlass(.card, in: Circle(), shadow: false)
            Text(title)
                .font(TBTypography.meta.weight(.medium))
                .foregroundStyle(TBColor.textPrimary)
            Spacer(minLength: 0)
        }
        .contentShape(.rect)
    }
}

#if DEBUG
#Preview("My profile · Light") {
    MyProfileView()
        .tbPreview(authState: .signedIn(user: .preview), colorScheme: .light)
}

#Preview("My profile · Dark") {
    MyProfileView()
        .tbPreview(authState: .signedIn(user: .preview), colorScheme: .dark)
}

#Preview("Settings · Light") {
    NavigationStack {
        SettingsView()
    }
    .tbPreview(authState: .signedIn(user: .preview), colorScheme: .light)
}

#Preview("Settings · Dark") {
    NavigationStack {
        SettingsView()
    }
    .tbPreview(authState: .signedIn(user: .preview), colorScheme: .dark)
}
#endif
