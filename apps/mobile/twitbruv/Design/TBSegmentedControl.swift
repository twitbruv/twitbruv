import SwiftUI

struct TBFeedSegmented<Selection: Hashable & Equatable>: View {
    @Binding var selection: Selection
    let options: [(label: String, value: Selection)]
    @Namespace private var ns

    private var selectedIndex: Int {
        options.firstIndex(where: { $0.value == selection }) ?? 0
    }

    var body: some View {
        GlassEffectContainer(spacing: 4) {
            HStack(spacing: 4) {
                ForEach(Array(options.enumerated()), id: \.offset) { idx, opt in
                    let isSelected = selection == opt.value
                    Button {
                        withAnimation(.spring(response: 0.25, dampingFraction: 0.75)) {
                            selection = opt.value
                        }
                    } label: {
                        Text(opt.label)
                            .font(TBTypography.meta.weight(isSelected ? .semibold : .medium))
                            .foregroundStyle(isSelected ? TBColor.textPrimary : TBColor.textSecondary)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 10)
                    }
                    .buttonStyle(TBSquishButtonStyle())
                    .background {
                        if isSelected {
                            Capsule(style: .continuous)
                                .fill(.clear)
                                .glassEffect(
                                    .regular.tint(Color.white.opacity(0.3)),
                                    in: .capsule
                                )
                                .glassEffectID("indicator", in: ns)
                                .matchedGeometryEffect(id: "pill", in: ns)
                        }
                    }
                }
            }
            .padding(4)
            .glassEffect(.regular, in: .capsule)
        }
    }
}
