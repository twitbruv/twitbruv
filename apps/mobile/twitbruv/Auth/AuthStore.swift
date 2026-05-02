import Foundation
import Observation
import os

enum AuthState: Equatable, Sendable {
    case loading
    case signedOut
    case needsEmailVerification(email: String)
    case needsHandle(user: CurrentUser)
    case signedIn(user: CurrentUser)
}

@Observable
@MainActor
final class AuthStore {
    private let api: APIClient
    private let log = Logger(subsystem: "app.twitbruv.ios", category: "auth")

    private(set) var state: AuthState = .loading
    var pendingTwoFactor: TwoFactorPending?

    var currentUser: CurrentUser? {
        if case .signedIn(let user) = state { return user }
        if case .needsHandle(let user) = state { return user }
        return nil
    }

    init(api: APIClient) {
        self.api = api
    }

    func bootstrap() async {
        do {
            let response: CurrentUserResponse = try await api.get(API.Me.get())
            ingest(user: response.user)
        } catch APIError.unauthorized {
            state = .signedOut
        } catch APIError.forbidden(let code) {
            switch code {
            case "email_not_verified":
                state = .needsEmailVerification(email: "")
            case "handle_required":
                if let user = try? await fetchSelf() { state = .needsHandle(user: user) }
                else { state = .signedOut }
            default:
                state = .signedOut
            }
        } catch {
            log.warning("bootstrap error \(String(describing: error))")
            state = .signedOut
        }
    }

    private func fetchSelf() async throws -> CurrentUser {
        let response: CurrentUserResponse = try await api.get(API.Me.get())
        return response.user
    }

    private func ingest(user: CurrentUser) {
        if !user.emailVerified {
            state = .needsEmailVerification(email: user.email)
        } else if user.handle == nil || user.handle?.isEmpty == true {
            state = .needsHandle(user: user)
        } else {
            state = .signedIn(user: user)
        }
    }

    struct SignInBody: Codable, Sendable {
        let email: String
        let password: String
    }

    struct SignUpBody: Codable, Sendable {
        let email: String
        let password: String
        let name: String?
    }

    struct AuthResponse: Codable, Sendable {
        struct UserShape: Codable, Sendable {
            let id: String?
            let email: String?
            let emailVerified: Bool?
        }
        let user: UserShape?
        let twoFactorRedirect: Bool?
        let token: String?
    }

    func signInEmail(email: String, password: String) async throws {
        do {
            let response: AuthResponse = try await api.send(
                API.Auth.signInEmail(),
                body: SignInBody(email: email, password: password)
            )
            if response.twoFactorRedirect == true {
                pendingTwoFactor = TwoFactorPending(email: email)
                return
            }
            try await loadAfterAuth()
        } catch let APIError.http(_, code, _) where code == "TWO_FACTOR_REQUIRED" {
            pendingTwoFactor = TwoFactorPending(email: email)
        }
    }

    func signUpEmail(email: String, password: String, displayName: String?) async throws {
        let _: AuthResponse = try await api.send(
            API.Auth.signUpEmail(),
            body: SignUpBody(email: email, password: password, name: displayName)
        )
        try await loadAfterAuth()
    }

    private func loadAfterAuth() async throws {
        do {
            let response: CurrentUserResponse = try await api.get(API.Me.get())
            ingest(user: response.user)
        } catch APIError.forbidden(let code) where code == "email_not_verified" {
            state = .needsEmailVerification(email: "")
        }
    }

    struct MagicLinkBody: Codable, Sendable {
        let email: String
        let callbackURL: String?
    }

    func requestMagicLink(email: String) async throws {
        let _: EmptyResponse = try await api.send(
            API.Auth.magicLink(),
            body: MagicLinkBody(
                email: email,
                callbackURL: Config.webBaseURL.appendingPathComponent("/auth/done").absoluteString
            )
        )
    }

    struct VerifyEmailBody: Codable, Sendable {
        let email: String
    }

    func resendVerificationEmail(email: String) async throws {
        let _: EmptyResponse = try await api.send(
            API.Auth.sendVerificationEmail(),
            body: VerifyEmailBody(email: email)
        )
    }

    func refreshAfterVerification() async {
        do {
            let response: CurrentUserResponse = try await api.get(API.Me.get())
            ingest(user: response.user)
        } catch {
            log.warning("verification refresh failed \(String(describing: error))")
        }
    }

    struct ClaimHandleBody: Codable, Sendable {
        let handle: String
    }

    func claimHandle(_ handle: String) async throws {
        let response: CurrentUserResponse = try await api.send(
            API.Me.claimHandle(),
            body: ClaimHandleBody(handle: handle)
        )
        ingest(user: response.user)
    }

    struct UpdateProfileBody: Codable, Sendable {
        var displayName: String?
        var bio: String?
        var location: String?
        var websiteUrl: String?
        var avatarUrl: String?
        var bannerUrl: String?
        var birthday: String?
        var timezone: String?
        var locale: String?
    }

    func updateProfile(_ body: UpdateProfileBody) async throws {
        let response: CurrentUserResponse = try await api.send(API.Me.update(), body: body)
        ingest(user: response.user)
    }

    struct TwoFactorBody: Codable, Sendable {
        let code: String
    }

    func submitTwoFactorTOTP(_ code: String) async throws {
        let _: EmptyResponse = try await api.send(
            API.Auth.twoFactorVerifyTOTP(),
            body: TwoFactorBody(code: code)
        )
        pendingTwoFactor = nil
        try await loadAfterAuth()
    }

    func submitTwoFactorBackup(_ code: String) async throws {
        let _: EmptyResponse = try await api.send(
            API.Auth.twoFactorVerifyBackup(),
            body: TwoFactorBody(code: code)
        )
        pendingTwoFactor = nil
        try await loadAfterAuth()
    }

    func handleUnauthorized() async {
        clearLocalSession()
    }

    func signOut() async {
        do {
            try await api.sendVoid(API.Auth.signOut())
        } catch {
            log.warning("sign out network error \(String(describing: error))")
        }
        clearLocalSession()
    }

    private func clearLocalSession() {
        let storage = HTTPCookieStorage.shared
        if let cookies = storage.cookies {
            for cookie in cookies { storage.deleteCookie(cookie) }
        }
        URLCache.shared.removeAllCachedResponses()
        state = .signedOut
        pendingTwoFactor = nil
    }
}

struct TwoFactorPending: Equatable, Sendable {
    let email: String
}
