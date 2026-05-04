import Foundation
import Observation

@Observable
@MainActor
final class AppEnvironment {
    let api: APIClient
    let auth: AuthStore
    let devTools: DevTools

    var isMaintenance = false
    var rateLimit: RateLimitNotice?

    init() {
        let api = APIClient()
        self.api = api
        self.auth = AuthStore(api: api)
        self.devTools = DevTools(api: api)
        api.delegate = self
        PushController.shared.attach(api: api)
    }

    #if DEBUG
    init(previewApi api: APIClient) {
        self.api = api
        self.auth = AuthStore(api: api)
        self.devTools = DevTools(api: api)
        api.delegate = self
        PushController.shared.attach(api: api)
    }
    #endif

    func bootstrap() async {
        await auth.bootstrap()
    }

    func clearRateLimit() {
        rateLimit = nil
    }
}

struct RateLimitNotice: Equatable {
    let bucket: String?
    let retryAfterSec: Int
    let receivedAt: Date
}

extension AppEnvironment: APIClientDelegate {
    func apiClientDidReceiveUnauthorized() {
        Task { @MainActor in
            await auth.handleUnauthorized()
        }
    }

    func apiClientNeedsOnboarding(code: String) {
        Task { @MainActor in
            await auth.bootstrap()
        }
    }

    func apiClientWasRateLimited(retryAfterSec: Int, bucket: String?) {
        rateLimit = RateLimitNotice(
            bucket: bucket, retryAfterSec: retryAfterSec, receivedAt: .now
        )
    }

    func apiClientDidEnterMaintenance() {
        isMaintenance = true
    }
}
