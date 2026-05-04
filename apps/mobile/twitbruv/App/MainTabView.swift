import SwiftUI
import UIKit

struct MainTabView: View {
    @State private var selection: AppTab = .home
    @State private var showCompose = false

    var body: some View {
        TabView(selection: $selection) {
            Tab(value: AppTab.home) {
                HomeFeedView()
            } label: {
                tbTabLabel("Home", systemImage: "house.fill")
            }

            Tab(value: AppTab.search) {
                SearchView()
            } label: {
                tbTabLabel("Search", systemImage: "magnifyingglass")
            }

            Tab(value: AppTab.notifications) {
                NotificationsView()
            } label: {
                tbTabLabel("Notifications", systemImage: "bell.fill")
            }

            Tab(value: AppTab.dms) {
                ConversationsListView()
            } label: {
                tbTabLabel("Messages", systemImage: "envelope.fill")
            }

            Tab(value: AppTab.me) {
                MyProfileView()
            } label: {
                tbTabLabel("Profile", systemImage: "person.crop.circle.fill")
            }
        }
        .overlay(alignment: .bottom) {
            DevSeedToast()
        }
        .overlay(alignment: .bottomTrailing) {
            ComposeLiquidGlassFAB {
                showCompose = true
            }
            .padding(.trailing, TBLayout.pagePadding)
            .padding(.bottom, TBLayout.composeFabBottomPadding)
        }
        .sheet(isPresented: $showCompose) {
            ComposerView(mode: .new)
        }
        .task {
            await PushController.shared.requestAndRegisterIfSignedIn()
        }
    }

    private func tbTabLabel(_ title: String, systemImage: String) -> some View {
        let config = UIImage.SymbolConfiguration(
            pointSize: TBLayout.tabBarIconPointSize,
            weight: .thin
        )
        let icon = UIImage(systemName: systemImage, withConfiguration: config)

        return Label {
            Text(title)
                .font(.system(size: TBLayout.tabBarTitlePointSize, weight: .thin))
        } icon: {
            if let icon {
                Image(uiImage: icon)
            } else {
                Image(systemName: systemImage)
            }
        }
    }
}

enum AppTab: Hashable {
    case home
    case search
    case notifications
    case dms
    case me
}

private struct ComposeLiquidGlassFAB: View {
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency

    let action: () -> Void

    var body: some View {
        Button(action: action) {
            if reduceTransparency {
                Image(systemName: "square.and.pencil")
                    .font(.system(size: TBLayout.composeFabIconPointSize, weight: .semibold))
                    .foregroundStyle(TBColor.accent)
                    .frame(width: TBLayout.composeFabSize, height: TBLayout.composeFabSize)
                    .background(Circle().fill(TBColor.base2))
                    .overlay {
                        Circle().strokeBorder(TBColor.glassStroke, lineWidth: 0.6)
                    }
            } else {
                Image(systemName: "square.and.pencil")
                    .font(.system(size: TBLayout.composeFabIconPointSize, weight: .semibold))
                    .foregroundStyle(TBColor.accent)
                    .frame(width: TBLayout.composeFabSize, height: TBLayout.composeFabSize)
                    .background { Circle().fill(.clear) }
                    .glassEffect(
                        Glass.clear.interactive(),
                        in: Circle()
                    )
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel("New post")
    }
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
