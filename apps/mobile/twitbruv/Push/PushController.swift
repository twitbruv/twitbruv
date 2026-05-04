import Foundation
import OSLog
import UIKit
import UserNotifications

@MainActor
final class PushController: NSObject, UNUserNotificationCenterDelegate {
    static let shared = PushController()

    private let log = Logger(subsystem: "app.twitbruv.ios", category: "push")

    private var lastTokenHex: String = ""
    private weak var api: APIClient?

    private override init() {
        super.init()
    }

    func attach(api: APIClient) {
        self.api = api
        UNUserNotificationCenter.current().delegate = self
    }

    func requestAndRegisterIfSignedIn() async {
        let center = UNUserNotificationCenter.current()
        let settings = await center.notificationSettings()
        switch settings.authorizationStatus {
        case .notDetermined:
            let ok = (try? await center.requestAuthorization(options: [.alert, .badge, .sound])) ?? false
            if !ok { return }
        case .denied:
            return
        default:
            break
        }
        UIApplication.shared.registerForRemoteNotifications()
    }

    func didRegister(deviceToken: Data) {
        let hex = deviceToken.map { String(format: "%02x", $0) }.joined()
        lastTokenHex = hex
        Task { await register(hex: hex) }
    }

    private func register(hex: String) async {
        guard let api else { return }
        struct Body: Codable, Sendable {
            let token: String
            let environment: String
            let bundleId: String
            let appVersion: String?
            let osVersion: String?
        }
        let bundleId = Bundle.main.bundleIdentifier ?? ""
        let appVersion = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String
        let osVersion = UIDevice.current.systemVersion
        #if DEBUG
        let envName = "sandbox"
        #else
        let envName = "production"
        #endif
        do {
            try await api.sendVoid(
                API.Me.pushRegister(),
                body: Body(
                    token: hex,
                    environment: envName,
                    bundleId: bundleId,
                    appVersion: appVersion,
                    osVersion: osVersion
                )
            )
        } catch {
            log.warning("register API failed: \(String(describing: error), privacy: .public)")
        }
    }

    func deregisterIfNeeded() async {
        guard let api, !lastTokenHex.isEmpty else { return }
        struct Body: Codable, Sendable {
            let token: String
        }
        let hex = lastTokenHex
        do {
            try await api.sendVoid(API.Me.pushUnregister(), body: Body(token: hex))
        } catch {}
        lastTokenHex = ""
    }

    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let userInfo = response.notification.request.content.userInfo
        if let deep = userInfo["deepLink"] as? String, let url = URL(string: deep) {
            Task { @MainActor in
                NotificationCenter.default.post(
                    name: .twitbruvDeepLink, object: nil, userInfo: ["url": url]
                )
            }
        }
        completionHandler()
    }

    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .sound])
    }
}
