import Foundation
import Observation

@Observable
@MainActor
final class DevTools {
    private let api: APIClient

    var isSeeding = false
    var seedMessage: String?
    var diagnostics: [DiagnosticLine] = []

    init(api: APIClient) {
        self.api = api
    }

    func seedLocalData() async -> Bool {
        #if DEBUG
        isSeeding = true
        seedMessage = nil
        defer { isSeeding = false }
        do {
            let response: DevSeedResponse = try await api.send(API.Dev.seed(), body: EmptyBody())
            seedMessage = response.message
            return true
        } catch {
            seedMessage = error.localizedDescription
            return false
        }
        #else
        seedMessage = "Dev seeding is only available in DEBUG builds."
        return false
        #endif
    }

    func runDiagnostics() async {
        #if DEBUG
        diagnostics = [
            DiagnosticLine(label: "API base", value: api.debugBaseURL.absoluteString),
            DiagnosticLine(label: "Origin", value: Config.mobileOrigin),
        ]

        await checkMe()
        await checkPosts()
        #endif
    }

    private func checkMe() async {
        do {
            let response: CurrentUserResponse = try await api.get(API.Me.get())
            diagnostics.append(
                DiagnosticLine(
                    label: "/api/me",
                    value: "ok handle=@\(response.user.handle ?? "nil") verified=\(response.user.emailVerified)"
                )
            )
        } catch {
            diagnostics.append(DiagnosticLine(label: "/api/me", value: error.localizedDescription))
        }
    }

    private func checkPosts() async {
        do {
            let response: PostsResponse = try await api.get(API.Feed.discovery(cursor: nil))
            diagnostics.append(
                DiagnosticLine(
                    label: "/api/posts",
                    value: "\(response.posts.count) posts next=\(response.nextCursor ?? "nil")"
                )
            )
        } catch {
            diagnostics.append(DiagnosticLine(label: "/api/posts", value: error.localizedDescription))
        }
    }
}

struct DevSeedResponse: Decodable, Sendable {
    let ok: Bool?
    let message: String?
}

struct DiagnosticLine: Identifiable, Hashable {
    let id = UUID()
    let label: String
    let value: String
}
