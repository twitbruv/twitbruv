import SwiftUI

struct MainTabView: View {
    @State private var selection: AppTab = .home
    @State private var showCompose = false

    var body: some View {
        TabView(selection: $selection) {
            HomeFeedView()
                .tabItem {
                    Label("Home", systemImage: "house.fill")
                }
                .tag(AppTab.home)

            SearchView()
                .tabItem {
                    Label("Search", systemImage: "magnifyingglass")
                }
                .tag(AppTab.search)

            NotificationsView()
                .tabItem {
                    Label("Notifications", systemImage: "bell.fill")
                }
                .tag(AppTab.notifications)

            ConversationsListView()
                .tabItem {
                    Label("Messages", systemImage: "envelope.fill")
                }
                .tag(AppTab.dms)

            MyProfileView()
                .tabItem {
                    Label("Profile", systemImage: "person.crop.circle.fill")
                }
                .tag(AppTab.me)
        }
        .overlay(alignment: .bottomTrailing) {
            GlassEffectContainer(spacing: 12) {
                Button {
                    showCompose = true
                } label: {
                    Image(systemName: "plus")
                        .font(.system(size: 22, weight: .semibold))
                        .foregroundStyle(TBColor.textPrimary)
                        .frame(width: 56, height: 56)
                        .contentShape(Circle())
                        .tbGlass(
                            .prominent,
                            in: Circle(),
                            interactive: true
                        )
                }
                .buttonStyle(.plain)
                .accessibilityLabel("New post")
            }
            .padding(.bottom, 70)
            .padding(.trailing, 16)
        }
        .overlay(alignment: .bottom) {
            DevSeedToast()
        }
        .sheet(isPresented: $showCompose) {
            ComposerView(mode: .new)
        }
    }
}

enum AppTab: Hashable {
    case home, search, notifications, dms, me
}

private struct DevSeedToast: View {
    @Environment(AppEnvironment.self) private var env

    var body: some View {
        Group {
            if env.devTools.isSeeding {
                HStack(spacing: 10) {
                    ProgressView()
                        .tint(TBColor.accent)
                    Text("Seeding local data…")
                        .font(TBTypography.meta.weight(.medium))
                        .foregroundStyle(TBColor.textPrimary)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .tbGlass(
                    .chrome,
                    in: RoundedRectangle(cornerRadius: 14, style: .continuous)
                )
                .padding(.bottom, 18)
            } else if let message = env.devTools.seedMessage {
                Text(message)
                    .font(TBTypography.meta.weight(.medium))
                    .foregroundStyle(TBColor.textPrimary)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .tbGlass(
                        .chrome,
                        in: RoundedRectangle(cornerRadius: 14, style: .continuous)
                    )
                    .padding(.bottom, 18)
                    .onTapGesture { env.devTools.seedMessage = nil }
            }
        }
    }
}
