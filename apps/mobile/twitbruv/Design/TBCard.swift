import SwiftUI

struct TBCard<Content: View>: View {
    var padding: CGFloat = TBLayout.pagePadding
    @ViewBuilder var content: () -> Content

    var body: some View {
        content()
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(TBColor.base2, in: RoundedRectangle(cornerRadius: TBLayout.radiusLG, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: TBLayout.radiusLG, style: .continuous)
                    .strokeBorder(TBColor.borderNeutral, lineWidth: 0.5)
            }
    }
}

struct TBInsetSurface<Content: View>: View {
    @ViewBuilder var content: () -> Content

    var body: some View {
        content()
            .padding(.vertical, 10)
            .padding(.horizontal, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(TBColor.subtleFill.opacity(0.6), in: RoundedRectangle(cornerRadius: TBLayout.radiusPostRow, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: TBLayout.radiusPostRow, style: .continuous)
                    .strokeBorder(TBColor.borderNeutral, lineWidth: 0.5)
            }
    }
}
