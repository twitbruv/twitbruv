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
            Text("twitbruv")
                .font(.title2.weight(.semibold))
                .foregroundStyle(.secondary)
        }
    }
}

private struct SignedOutContainer: View {
    @State private var path = NavigationPath()
    var body: some View {
        NavigationStack(path: $path) {
            SignInView(path: $path)
        }
    }
}

private struct MaintenanceFullView: View {
    @Environment(AppEnvironment.self) private var env
    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "wrench.and.screwdriver")
                .font(.largeTitle)
            Text("Maintenance")
                .font(.title2.weight(.semibold))
            Text("twitbruv is updating. Please try again in a moment.")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
                .padding(.horizontal)
            Button("Retry") {
                env.isMaintenance = false
                Task { await env.bootstrap() }
            }
            .buttonStyle(.borderedProminent)
        }
        .padding()
    }
}
