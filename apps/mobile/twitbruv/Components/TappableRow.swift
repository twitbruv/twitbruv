import SwiftUI

/// Wraps row content in a `Button` so the entire row width is hit-tested,
/// and so taps on padding / whitespace / between subviews still register.
///
/// Inner interactive elements (avatars, engagement icons, menus, swipe
/// actions) keep working as their own taps because nested SwiftUI `Button`s
/// take priority within their own bounds.
///
/// Use anywhere you'd otherwise apply `.contentShape(.rect).onTapGesture { ... }`
/// to a list row.
struct TappableRow<Content: View>: View {
    let action: () -> Void
    @ViewBuilder let content: () -> Content

    var body: some View {
        Button(action: action) {
            content()
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(.rect)
        }
        .buttonStyle(.plain)
    }
}
