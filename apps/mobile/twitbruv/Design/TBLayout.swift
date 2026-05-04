import SwiftUI

enum TBLayout {
    static let feedMaxWidth: CGFloat = 600
    static let feedListRowSpacing: CGFloat = 10
    static let pagePadding: CGFloat = 16
    static let glassBarOuterMargin: CGFloat = 8
    static let radiusSM: CGFloat = 4
    static let radiusMD: CGFloat = 8
    static let radiusLG: CGFloat = 12
    static let radiusXL: CGFloat = 16
    static let radiusPostRow: CGFloat = 16
    static let radiusGlassBar: CGFloat = 24
    static let radiusGlassPanel: CGFloat = 22
    static let radiusGlassCard: CGFloat = 18
    static let hitTarget: CGFloat = 44
    static let composeFabSize: CGFloat = 48
    static let composeFabIconPointSize: CGFloat = 19
    static let composeFabBottomPadding: CGFloat = 58
    static let tabBarIconPointSize: CGFloat = 14
    static let tabBarTitlePointSize: CGFloat = 10
    static let feedScopeHeaderSlotHeight: CGFloat = 56
    static let feedScopeHeaderHideOffset: CGFloat = 56
    static let feedScrollCollapseBucketPoints: CGFloat = 28
    static let headerHeight: CGFloat = 48
    static let avatarFeed: CGFloat = 40
    static let easeOutExpo = Animation.timingCurve(0.16, 1, 0.3, 1, duration: 0.15)
    static func profileBannerNavUnderlap(topSafeArea: CGFloat, navChrome: CGFloat = 52)
        -> CGFloat
    {
        topSafeArea + navChrome
    }
}

extension View {
    func tbReadableColumn(maxWidth: CGFloat = TBLayout.feedMaxWidth) -> some View {
        frame(maxWidth: maxWidth)
            .frame(maxWidth: .infinity)
    }

    @ViewBuilder
    func tbOptionalTabBadge(_ count: Int) -> some View {
        if count > 0 {
            self.badge(count)
        } else {
            self
        }
    }
}
