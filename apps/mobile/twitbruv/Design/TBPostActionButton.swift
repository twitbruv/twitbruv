import SwiftUI

struct TBPostActionButton: View {
    /// Heroicon asset name, e.g. `heart-outline`, `bookmark-solid`.
    let icon: String
    let count: Int
    var isActive: Bool = false
    var activeColor: Color = TBColor.accent
    var iconSize: CGFloat = 16
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                HeroIcon(name: icon, size: iconSize)
                if count > 0 {
                    Text(TBPostActionButton.formatCount(count))
                        .monospacedDigit()
                }
            }
            .font(TBTypography.meta)
            .foregroundStyle(isActive ? activeColor : TBColor.textTertiary)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
    }

    static func formatCount(_ n: Int) -> String {
        if n < 1000 { return "\(n)" }
        if n < 10_000 { return String(format: "%.1fk", Double(n) / 1000.0) }
        if n < 1_000_000 { return "\(n / 1000)k" }
        return String(format: "%.1fM", Double(n) / 1_000_000.0)
    }
}
