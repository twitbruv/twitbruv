import Foundation
import Observation

@Observable
@MainActor
final class DeepLinkRouter {
    private(set) var feedRevision = 0
    private(set) var dmRevision = 0
    private var stagedFeedRoutes: [FeedRoute] = []
    private var stagedDMRoutes: [DMRoute] = []

    func handle(_ url: URL, webBaseURL: URL = Config.webBaseURL) {
        guard let destination = DeepLinkParser.parse(url: url, webBaseURL: webBaseURL) else {
            return
        }
        switch destination {
        case .feed(let route):
            stagedFeedRoutes.append(route)
            feedRevision += 1
        case .dm(let route):
            stagedDMRoutes.append(route)
            dmRevision += 1
        }
    }

    func takePendingFeedRoutes() -> [FeedRoute] {
        let out = stagedFeedRoutes
        stagedFeedRoutes = []
        return out
    }

    func takePendingDMRoutes() -> [DMRoute] {
        let out = stagedDMRoutes
        stagedDMRoutes = []
        return out
    }
}
