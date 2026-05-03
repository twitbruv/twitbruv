import SwiftUI

struct TBPageHeader<Trailing: View>: View {
    let title: String
    @ViewBuilder var trailing: () -> Trailing

    init(
        title: String,
        @ViewBuilder trailing: @escaping () -> Trailing
    ) {
        self.title = title
        self.trailing = trailing
    }

    var body: some View {
        HStack(spacing: 12) {
            Text(title)
                .font(TBTypography.navLabel.weight(.semibold))
                .foregroundStyle(TBColor.textPrimary)
            Spacer()
            trailing()
        }
        .padding(.horizontal, TBLayout.pagePadding)
        .frame(height: TBLayout.headerHeight)
        .frame(maxWidth: .infinity)
    }
}

extension TBPageHeader where Trailing == EmptyView {
    init(title: String) {
        self.init(title: title) { EmptyView() }
    }
}
