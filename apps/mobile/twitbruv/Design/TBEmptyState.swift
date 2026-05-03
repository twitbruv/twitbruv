import SwiftUI

struct TBEmptyState: View {
    let icon: String
    let title: String
    var message: String?

    var body: some View {
        VStack(spacing: 14) {
            ZStack {
                Circle()
                    .fill(TBColor.glassCardTint)
                    .frame(width: 56, height: 56)
                    .tbGlass(.card, in: Circle(), shadow: false)
                Image(systemName: icon)
                    .font(.system(size: 22, weight: .medium))
                    .foregroundStyle(TBColor.textTertiary)
            }
            Text(title)
                .font(TBTypography.cardTitle)
                .foregroundStyle(TBColor.textPrimary)
                .multilineTextAlignment(.center)
            if let message {
                Text(message)
                    .font(TBTypography.meta)
                    .foregroundStyle(TBColor.textSecondary)
                    .multilineTextAlignment(.center)
            }
        }
        .padding(24)
        .frame(maxWidth: .infinity)
        .tbGlass(
            .card,
            in: RoundedRectangle(cornerRadius: TBLayout.radiusGlassPanel, style: .continuous),
            shadow: false
        )
        .padding(.horizontal, TBLayout.pagePadding)
    }
}
