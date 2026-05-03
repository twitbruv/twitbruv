import SwiftUI

struct TBButton: View {
    enum Style {
        case primary
        case outline
        case secondary
        case transparent
        case danger
        case dangerLight
    }

    let title: String
    var style: Style = .outline
    var expands: Bool = false
    var isLoading: Bool = false
    var isDisabled: Bool = false
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            ZStack {
                if isLoading {
                    ProgressView()
                        .tint(foregroundColor)
                } else {
                    Text(title)
                        .font(TBTypography.meta.weight(.medium))
                        .foregroundStyle(foregroundColor)
                        .frame(maxWidth: expands ? .infinity : nil)
                }
            }
            .frame(minHeight: 32)
            .padding(.horizontal, horizontalPadding)
            .padding(.vertical, 6)
            .background {
                background
                    .clipShape(Capsule(style: .continuous))
            }
            .tbGlassCapsule(glassStyle, interactive: true, shadow: style == .primary)
            .clipShape(RoundedRectangle(cornerRadius: 9999, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(isDisabled || isLoading)
        .opacity(isDisabled || isLoading ? 0.55 : 1)
    }

    private var horizontalPadding: CGFloat {
        switch style {
        case .primary, .outline, .secondary, .danger, .dangerLight:
            return 14
        case .transparent:
            return 10
        }
    }

    private var background: some View {
        Group {
            switch style {
            case .primary:
                TBColor.inverse.opacity(0.88)
            case .outline:
                Color.clear
            case .secondary:
                TBColor.subtleFill.opacity(0.34)
            case .transparent:
                Color.clear
            case .danger:
                TBColor.danger.opacity(0.86)
            case .dangerLight:
                TBColor.dangerSubtle.opacity(0.7)
            }
        }
    }

    private var glassStyle: TBGlassStyle {
        switch style {
        case .primary, .danger:
            return .prominent
        case .outline, .secondary, .dangerLight:
            return .chrome
        case .transparent:
            return .card
        }
    }

    private var foregroundColor: Color {
        switch style {
        case .primary:
            TBColor.textOnInverse
        case .outline, .secondary:
            TBColor.textPrimary
        case .transparent:
            TBColor.textSecondary
        case .danger:
            TBColor.textOnInverse
        case .dangerLight:
            TBColor.danger
        }
    }
}

struct TBIconButton: View {
    let systemName: String
    var accessibilityLabel: String
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: 18, weight: .medium))
                .foregroundStyle(TBColor.textSecondary)
                .frame(width: TBLayout.hitTarget, height: TBLayout.hitTarget)
                .tbGlass(.chrome, in: Circle(), interactive: true, shadow: false)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(accessibilityLabel)
    }
}
