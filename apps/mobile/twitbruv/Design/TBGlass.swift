import SwiftUI

enum TBGlassStyle {
    case chrome
    case panel
    case card
    case field
    case prominent

    var tint: Color {
        switch self {
        case .chrome:
            TBColor.glassChromeTint
        case .panel:
            TBColor.glassPanelTint
        case .card:
            TBColor.glassCardTint
        case .field:
            TBColor.glassFieldTint
        case .prominent:
            TBColor.glassProminentTint
        }
    }

    var stroke: Color {
        switch self {
        case .prominent:
            TBColor.borderStrong.opacity(0.72)
        default:
            TBColor.glassStroke
        }
    }

    var shadowOpacity: Double {
        switch self {
        case .chrome, .panel:
            0.12
        case .card, .field:
            0.07
        case .prominent:
            0.18
        }
    }
}

private struct TBGlassSurfaceModifier<S: InsettableShape>: ViewModifier {
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency

    let style: TBGlassStyle
    let shape: S
    var interactive: Bool
    var shadow: Bool

    func body(content: Content) -> some View {
        let tintedGlass = Glass.regular
            .tint(style.tint)
            .interactive(interactive)

        Group {
            if reduceTransparency {
                content
                    .background(TBColor.base2, in: shape)
            } else {
                content
                    .glassEffect(tintedGlass, in: shape)
            }
        }
        .overlay {
            shape
                .strokeBorder(style.stroke, lineWidth: 0.6)
        }
        .overlay(alignment: .top) {
            shape
                .strokeBorder(TBColor.glassHighlight, lineWidth: 0.5)
                .blendMode(.screen)
                .opacity(reduceTransparency ? 0.2 : 0.55)
        }
        .shadow(
            color: TBColor.glassShadow.opacity(shadow ? style.shadowOpacity : 0),
            radius: shadow ? 18 : 0,
            y: shadow ? 8 : 0
        )
    }
}

struct TBGlassPanel<Content: View>: View {
    var style: TBGlassStyle = .panel
    var padding: CGFloat = TBLayout.pagePadding
    var radius: CGFloat = TBLayout.radiusGlassPanel
    @ViewBuilder var content: () -> Content

    var body: some View {
        content()
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .tbGlass(
                style,
                in: RoundedRectangle(cornerRadius: radius, style: .continuous)
            )
    }
}

struct TBGlassBar<Content: View>: View {
    var padding: EdgeInsets = EdgeInsets(
        top: 10,
        leading: TBLayout.pagePadding,
        bottom: 10,
        trailing: TBLayout.pagePadding
    )
    @ViewBuilder var content: () -> Content

    var body: some View {
        content()
            .padding(padding)
            .frame(maxWidth: .infinity)
            .tbGlass(
                .chrome,
                in: RoundedRectangle(cornerRadius: TBLayout.radiusGlassBar, style: .continuous),
                shadow: false
            )
            .padding(.horizontal, 8)
    }
}

extension View {
    func tbGlass<S: InsettableShape>(
        _ style: TBGlassStyle = .panel,
        in shape: S,
        interactive: Bool = false,
        shadow: Bool = true
    ) -> some View {
        modifier(
            TBGlassSurfaceModifier(
                style: style,
                shape: shape,
                interactive: interactive,
                shadow: shadow
            )
        )
    }

    func tbGlassCapsule(
        _ style: TBGlassStyle = .chrome,
        interactive: Bool = false,
        shadow: Bool = true
    ) -> some View {
        tbGlass(style, in: Capsule(style: .continuous), interactive: interactive, shadow: shadow)
    }

    func tbGlassPanel(
        _ style: TBGlassStyle = .panel,
        radius: CGFloat = TBLayout.radiusGlassPanel,
        shadow: Bool = true
    ) -> some View {
        tbGlass(
            style,
            in: RoundedRectangle(cornerRadius: radius, style: .continuous),
            shadow: shadow
        )
    }
}
