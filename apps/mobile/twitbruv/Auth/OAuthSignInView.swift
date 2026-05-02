import AuthenticationServices
import SwiftUI

struct OAuthSignInView: View {
    @Environment(AppEnvironment.self) private var env
    let provider: String

    @State private var coordinator = OAuthCoordinator()
    @State private var isRunning = false
    @State private var errorMessage: String?

    var body: some View {
        VStack(spacing: 24) {
            Spacer()
            Image(systemName: "lock.shield")
                .font(.system(size: 48))
                .foregroundStyle(.tint)
            Text("Sign in with \(provider.capitalized)")
                .font(.title2.weight(.semibold))
            Text(
                "Opens a secure browser to authenticate, then returns you here once your session is set."
            )
            .multilineTextAlignment(.center)
            .foregroundStyle(.secondary)
            .padding(.horizontal)

            if let errorMessage {
                Text(errorMessage).foregroundStyle(.red).font(.callout)
            }

            Button {
                Task { await start() }
            } label: {
                if isRunning {
                    ProgressView()
                } else {
                    Text("Continue").frame(maxWidth: .infinity)
                }
            }
            .buttonStyle(.borderedProminent)
            .padding(.horizontal)
            .disabled(isRunning)

            Spacer()
        }
        .padding()
        .navigationTitle(provider.capitalized)
    }

    private func start() async {
        errorMessage = nil
        isRunning = true
        defer { isRunning = false }
        do {
            try await coordinator.start(provider: provider)
            await env.auth.bootstrap()
        } catch ASWebAuthenticationSessionError.canceledLogin {
            // user dismissed, no-op
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

@MainActor
final class OAuthCoordinator: NSObject, ASWebAuthenticationPresentationContextProviding {
    private var session: ASWebAuthenticationSession?

    func start(provider: String) async throws {
        guard let url = URL(
            string: "/api/auth/sign-in/social/\(provider)",
            relativeTo: Config.apiBaseURL
        )?.absoluteURL else {
            throw APIError.invalidResponse
        }
        var components = URLComponents(url: url, resolvingAgainstBaseURL: false)!
        components.queryItems = [
            URLQueryItem(
                name: "callbackURL",
                value: "\(Config.oauthCallbackScheme)://app\(Config.oauthCallbackPath)"
            )
        ]
        guard let authURL = components.url else { throw APIError.invalidResponse }

        try await withCheckedThrowingContinuation {
            (continuation: CheckedContinuation<Void, Error>) in
            let session = ASWebAuthenticationSession(
                url: authURL,
                callback: .customScheme(Config.oauthCallbackScheme)
            ) { url, error in
                if let error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume(returning: ())
                }
                _ = url
            }
            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = false
            self.session = session
            session.start()
        }
    }

    nonisolated func presentationAnchor(
        for session: ASWebAuthenticationSession
    ) -> ASPresentationAnchor {
        DispatchQueue.main.sync {
            let scene = UIApplication.shared.connectedScenes
                .compactMap { $0 as? UIWindowScene }
                .first(where: { $0.activationState == .foregroundActive })
            if let key = scene?.keyWindow { return key }
            if let scene { return ASPresentationAnchor(windowScene: scene) }
            return UIWindow()
        }
    }
}
