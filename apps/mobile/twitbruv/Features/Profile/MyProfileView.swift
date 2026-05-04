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
        Form {
            Section("Notifications") {
                Button("System notification settings") {
                    if let url = URL(string: UIApplication.openSettingsURLString) {
                        openURL(url)
                    }
                }
                .foregroundStyle(TBColor.accent)
            }

            Section("Library") {
                NavigationLink("Bookmarks") { BookmarksView() }
                NavigationLink("Lists") { MyListsView() }
                NavigationLink("Scheduled") { ScheduledPostsView() }
            }

            Section("Privacy") {
                NavigationLink("Blocked accounts") {
                    UsersListView(title: "Blocked", endpoint: { cursor in
                        API.Me.blocks(cursor: cursor)
                    })
                }
                NavigationLink("Muted accounts") {
                    UsersListView(title: "Muted", endpoint: { cursor in
                        API.Me.mutes(cursor: cursor)
                    })
                }
            }

            Section("Account") {
                NavigationLink("Edit profile") { EditProfileView() }
                #if DEBUG
                NavigationLink("API diagnostics") {
                    DevDiagnosticsView()
                }
                Button {
                    Task { _ = await env.devTools.seedLocalData() }
                } label: {
                    if env.devTools.isSeeding {
                        ProgressView()
                    } else {
                        Text("Seed local data")
                    }
                }
                #endif
                Button(role: .destructive) {
                    Task {
                        isSigningOut = true
                        await auth.signOut()
                        isSigningOut = false
                    }
                } label: {
                    if isSigningOut { ProgressView() }
                    else { Text("Sign out") }
                }
            }
        }
        .navigationTitle("Settings")
        .scrollContentBackground(.hidden)
        .background(Color.clear)
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
