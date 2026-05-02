import SwiftUI

struct AppRouter: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(AuthStore.self) private var auth

    var body: some View {
        ZStack {
            content
        }
        .overlay(alignment: .top) { MaintenanceBannerView() }
        .overlay(alignment: .bottom) { RateLimitToast() }
    }

    @ViewBuilder
    private var content: some View {
        if env.isMaintenance {
            MaintenanceFullView()
        } else {
            switch auth.state {
            case .loading:
                SplashView()
            case .signedOut:
                SignedOutContainer()
            case .needsEmailVerification:
                EmailVerifyPendingView()
            case .needsHandle:
                HandleClaimView()
            case .signedIn:
                MainTabView()
            }
        }
    }
}

private struct SplashView: View {
    var body: some View {
        VStack(spacing: 16) {
            ProgressView()
                .tint(TBColor.accent)
            Text("twitbruv")
                .font(TBTypography.pageTitle)
                .foregroundStyle(TBColor.textSecondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.clear)
    }
}

private struct SignedOutContainer: View {
    @State private var path = NavigationPath()
    var body: some View {
        NavigationStack(path: $path) {
            SignInView(path: $path)
        }
        .background(Color.clear)
    }
}

private struct MaintenanceFullView: View {
    @Environment(AppEnvironment.self) private var env
    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "wrench.and.screwdriver")
                .font(.system(size: 40, weight: .medium))
                .foregroundStyle(TBColor.textTertiary)
            Text("Maintenance")
                .font(TBTypography.pageTitle)
                .foregroundStyle(TBColor.textPrimary)
            Text("twitbruv is updating. Please try again in a moment.")
                .multilineTextAlignment(.center)
                .font(TBTypography.bodySecondary)
                .foregroundStyle(TBColor.textSecondary)
                .padding(.horizontal)
            TBButton(title: "Retry", style: .primary, expands: true) {
                env.isMaintenance = false
                Task { await env.bootstrap() }
            }
            .padding(.horizontal, TBLayout.pagePadding)
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.clear)
    }
}
