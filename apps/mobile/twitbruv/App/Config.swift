import Foundation

enum Config {
    static let mobileOrigin = "twitbruv-ios://app"
    static let oauthCallbackScheme = "twitbruv-ios"
    static let oauthCallbackPath = "/auth/done"

    static var apiBaseURL: URL {
        if let override = Bundle.main.object(forInfoDictionaryKey: "API_BASE_URL") as? String,
           !override.isEmpty,
           let url = URL(string: override)
        {
            return url
        }
        #if DEBUG
        return URL(string: "http://localhost:3001")!
        #else
        return URL(string: "https://api.twitbruv.app")!
        #endif
    }

    static var webBaseURL: URL {
        if let override = Bundle.main.object(forInfoDictionaryKey: "WEB_BASE_URL") as? String,
           !override.isEmpty,
           let url = URL(string: override)
        {
            return url
        }
        #if DEBUG
        return URL(string: "http://localhost:3000")!
        #else
        return URL(string: "https://twitbruv.app")!
        #endif
    }
}
