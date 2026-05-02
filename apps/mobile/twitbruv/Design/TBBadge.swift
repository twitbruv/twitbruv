import SwiftUI

struct TBBadge: View {
    let text: String
    var prominent: Bool = false

    var body: some View {
        Text(text)
            .font(TBTypography.badge)
            .foregroundStyle(
                prominent
                    ? TBColor.textOnInverse
                    : TBColor.textSecondary
            )
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .background {
                Capsule(style: .continuous)
                    .fill(prominent ? TBColor.inverse : TBColor.subtleFill)
            }
    }
}
