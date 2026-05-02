import SwiftUI

@main
struct twitbruvApp: App {
    @State private var env = AppEnvironment()

    init() {
        TBTheme.apply()
    }

    var body: some Scene {
        WindowGroup {
            AppRouter()
                .environment(env)
                .environment(env.auth)
                .tbChrome()
                .task { await env.bootstrap() }
                .onOpenURL { url in
                    NotificationCenter.default.post(
                        name: .twitbruvDeepLink, object: nil, userInfo: ["url": url]
                    )
                }
        }
    }
}

extension Notification.Name {
    static let twitbruvDeepLink = Notification.Name("twitbruv.deepLink")
    static let postChanged = Notification.Name("twitbruv.postChanged")
}
