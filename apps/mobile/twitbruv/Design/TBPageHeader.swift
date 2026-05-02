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
        .background {
            Rectangle()
                .fill(.ultraThinMaterial)
                .overlay {
                    TBColor.base1.opacity(0.88)
                }
        }
        .overlay(alignment: .bottom) {
            Rectangle()
                .fill(TBColor.borderNeutral)
                .frame(height: 0.5)
        }
    }
}

extension TBPageHeader where Trailing == EmptyView {
    init(title: String) {
        self.init(title: title) { EmptyView() }
    }
}
