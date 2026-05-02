import SwiftUI

struct TBFeedSegmented<Selection: Hashable>: View {
    @Binding var selection: Selection
    let options: [(label: String, value: Selection)]

    var body: some View {
        HStack(spacing: 0) {
            ForEach(Array(options.enumerated()), id: \.offset) { _, opt in
                let on = selection == opt.value
                Button {
                    withAnimation(TBLayout.easeOutExpo) { selection = opt.value }
                } label: {
                    Text(opt.label)
                        .font(TBTypography.meta.weight(.medium))
                        .foregroundStyle(on ? TBColor.textPrimary : TBColor.textTertiary)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                        .background {
                            if on {
                                Capsule(style: .continuous)
                                    .fill(TBColor.subtleFill)
                            }
                        }
                }
                .buttonStyle(.plain)
            }
        }
        .padding(4)
        .background(TBColor.base2, in: Capsule(style: .continuous))
        .overlay {
            Capsule(style: .continuous)
                .strokeBorder(TBColor.borderNeutral, lineWidth: 0.5)
        }
    }
}
