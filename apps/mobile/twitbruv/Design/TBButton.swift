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
            .background(background)
            .overlay {
                RoundedRectangle(cornerRadius: 9999, style: .continuous)
                    .strokeBorder(outlineColor, lineWidth: outlineWidth)
            }
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
                TBColor.inverse
            case .outline:
                TBColor.base2
            case .secondary:
                TBColor.subtleFill
            case .transparent:
                Color.clear
            case .danger:
                TBColor.danger
            case .dangerLight:
                TBColor.dangerSubtle
            }
        }
    }

    private var outlineColor: Color {
        switch style {
        case .outline:
            TBColor.borderNeutral
        case .danger:
            TBColor.danger
        case .dangerLight:
            Color.clear
        case .primary, .secondary, .transparent:
            Color.clear
        }
    }

    private var outlineWidth: CGFloat {
        switch style {
        case .outline, .danger:
            return 1
        default:
            return 0
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
                .background(TBColor.subtleFill, in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(accessibilityLabel)
    }
}
