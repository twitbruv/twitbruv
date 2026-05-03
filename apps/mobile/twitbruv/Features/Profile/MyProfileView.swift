import SwiftUI

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
    @State private var isSigningOut = false

    var body: some View {
        Form {
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
