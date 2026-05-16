import SwiftUI

@main
struct twitbruvApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
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
                .task {
                    await env.bootstrap()
                }
                .onOpenURL { url in
                    env.deepLinks.handle(url)
                }
                .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
                    if let url = activity.webpageURL {
                        env.deepLinks.handle(url)
                    }
                }
        }
    }
}
