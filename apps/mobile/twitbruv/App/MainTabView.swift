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
                    Label("Alerts", systemImage: "bell.fill")
                }
                .tag(AppTab.notifications)

            ConversationsListView()
                .tabItem {
                    Label("DMs", systemImage: "envelope.fill")
                }
                .tag(AppTab.dms)

            MyProfileView()
                .tabItem {
                    Label("Me", systemImage: "person.crop.circle.fill")
                }
                .tag(AppTab.me)
        }
        .overlay(alignment: .bottomTrailing) {
            Button {
                showCompose = true
            } label: {
                Image(systemName: "plus")
                    .font(.title2.weight(.semibold))
                    .foregroundStyle(.white)
                    .padding(18)
                    .background(.tint, in: .circle)
                    .shadow(radius: 6, y: 3)
            }
            .padding(.bottom, 70)
            .padding(.trailing, 16)
            .accessibilityLabel("New post")
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
                    Text("Seeding local data…")
                        .font(.callout.weight(.medium))
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(.thinMaterial, in: .rect(cornerRadius: 14))
                .padding(.bottom, 18)
            } else if let message = env.devTools.seedMessage {
                Text(message)
                    .font(.callout.weight(.medium))
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(.thinMaterial, in: .rect(cornerRadius: 14))
                    .padding(.bottom, 18)
                    .onTapGesture { env.devTools.seedMessage = nil }
            }
        }
    }
}
