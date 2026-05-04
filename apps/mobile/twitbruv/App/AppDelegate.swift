import OSLog
import UIKit

final class AppDelegate: NSObject, UIApplicationDelegate {
    private let log = Logger(subsystem: "app.twitbruv.ios", category: "push")
    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        Task { @MainActor in
            PushController.shared.didRegister(deviceToken: deviceToken)
        }
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        log.error("didFailToRegister: \(error.localizedDescription, privacy: .public)")
    }
}
