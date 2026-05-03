import SwiftUI

struct TBCard<Content: View>: View {
    var padding: CGFloat = TBLayout.pagePadding
    @ViewBuilder var content: () -> Content

    var body: some View {
        content()
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .tbGlass(
                .panel,
                in: RoundedRectangle(cornerRadius: TBLayout.radiusGlassPanel, style: .continuous)
            )
    }
}

struct TBInsetSurface<Content: View>: View {
    @ViewBuilder var content: () -> Content

    var body: some View {
        content()
            .padding(.vertical, 10)
            .padding(.horizontal, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .tbGlass(
                .card,
                in: RoundedRectangle(cornerRadius: TBLayout.radiusPostRow, style: .continuous),
                shadow: false
            )
    }
}
