import SwiftUI

struct ErrorBanner: View {
    let message: String
    var onRetry: (() -> Void)?

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(TBColor.warn)
            VStack(alignment: .leading, spacing: 4) {
                Text("Something went wrong")
                    .font(TBTypography.meta.weight(.semibold))
                    .foregroundStyle(TBColor.textPrimary)
                Text(message)
                    .font(TBTypography.caption)
                    .foregroundStyle(TBColor.textSecondary)
            }
            Spacer()
            if let onRetry {
                TBButton(title: "Retry", style: .outline, action: onRetry)
            }
        }
        .padding(12)
        .background(
            TBColor.warnSubtle.opacity(0.45),
            in: RoundedRectangle(cornerRadius: TBLayout.radiusGlassCard, style: .continuous)
        )
        .tbGlass(
            .panel,
            in: RoundedRectangle(cornerRadius: TBLayout.radiusGlassCard, style: .continuous)
        )
        .padding(.horizontal, TBLayout.pagePadding)
    }
}

struct EmptyStateView: View {
    let icon: String
    let title: String
    var message: String?
    var actionTitle: String?
    var action: (() -> Void)?

    var body: some View {
        VStack(spacing: 16) {
            TBEmptyState(icon: icon, title: title, message: message)
            if let actionTitle, let action {
                TBButton(title: actionTitle, style: .primary, expands: true, action: action)
                    .padding(.horizontal, TBLayout.pagePadding)
            }
        }
        .padding(.vertical, 32)
        .frame(maxWidth: .infinity)
    }
}
