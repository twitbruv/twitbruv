import Foundation
import Observation
import os

@Observable
@MainActor
final class AppBadgeStore {
    private let api: APIClient
    private let log = Logger(subsystem: "app.twitbruv.ios", category: "badges")

    var notificationUnreadCount = 0
    var dmUnreadCount = 0
    private var isRefreshing = false

    init(api: APIClient) {
        self.api = api
    }

    func refreshAll() async {
        guard !isRefreshing else { return }
        isRefreshing = true
        defer { isRefreshing = false }
        await refreshNotifications()
        await refreshDMs()
    }

    func refreshNotifications() async {
        do {
            let response: NotificationsUnreadCountResponse = try await api.get(
                API.Notifications.unreadCount()
            )
            notificationUnreadCount = response.value
        } catch {
            log.debug("notification badge refresh failed")
        }
    }

    func refreshDMs() async {
        do {
            let response: UnreadCountResponse = try await api.get(API.DMs.unreadCount())
            dmUnreadCount = response.count ?? response.unread ?? 0
        } catch {
            log.debug("dm badge refresh failed")
        }
    }

    func clear() {
        notificationUnreadCount = 0
        dmUnreadCount = 0
    }
}
