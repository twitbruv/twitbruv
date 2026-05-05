import SwiftUI

struct TBButton: View {
    enum Style {
        case primary
        case promote
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
                }
            }
            .frame(maxWidth: expands ? .infinity : nil, minHeight: 32)
            .padding(.horizontal, horizontalPadding)
            .padding(.vertical, 6)
            .background {
                background
                    .clipShape(Capsule(style: .continuous))
            }
            .modifier(ButtonGlassModifier(style: style))
        }
        .buttonStyle(TBSquishButtonStyle())
        .disabled(isDisabled || isLoading)
        .opacity(isInactive && usesOpaqueBackground ? 1 : (isInactive ? 0.55 : 1))
        .saturation(isInactive && usesOpaqueBackground ? 0 : 1)
    }

    private var isInactive: Bool { isDisabled || isLoading }

    private var usesOpaqueBackground: Bool {
        switch style {
        case .primary, .promote, .danger:
            return true
        default:
            return false
        }
    }

    private var horizontalPadding: CGFloat {
        switch style {
        case .primary, .promote, .outline, .secondary, .danger, .dangerLight:
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
            case .promote:
                TBColor.warn.opacity(0.95)
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

    private var foregroundColor: Color {
        let base: Color = switch style {
        case .primary:
            TBColor.textOnInverse
        case .promote:
            Color.white
        case .outline, .secondary:
            TBColor.textPrimary
        case .transparent:
            TBColor.textSecondary
        case .danger:
            TBColor.textOnInverse
        case .dangerLight:
            TBColor.danger
        }
        return isInactive && usesOpaqueBackground ? base.opacity(0.4) : base
    }
}

private struct ButtonGlassModifier: ViewModifier {
    let style: TBButton.Style

    func body(content: Content) -> some View {
        switch style {
        case .primary, .promote, .danger:
            content
                .clipShape(Capsule(style: .continuous))
                .shadow(
                    color: TBColor.glassShadow.opacity(0.18),
                    radius: 18,
                    y: 8
                )
        default:
            content
                .tbGlassCapsule(glassStyle, interactive: false, shadow: false)
        }
    }

    private var glassStyle: TBGlassStyle {
        switch style {
        case .outline, .secondary, .dangerLight:
            .chrome
        case .transparent:
            .card
        default:
            .chrome
        }
    }
}

struct TBIconButton: View {
    /// Heroicon asset name, e.g. `chevron-left-solid`.
    let icon: String
    var accessibilityLabel: String
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            HeroIcon(name: icon, size: 18)
                .foregroundStyle(TBColor.textSecondary)
                .frame(width: TBLayout.hitTarget, height: TBLayout.hitTarget)
                .tbGlass(.chrome, in: Circle(), interactive: false, shadow: false)
        }
        .buttonStyle(TBSquishButtonStyle())
        .accessibilityLabel(accessibilityLabel)
    }
}

struct TBSquishButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.96 : 1)
            .animation(.spring(response: 0.25, dampingFraction: 0.7), value: configuration.isPressed)
    }
}

