import SwiftUI

struct MediaCarouselView: View {
    let media: [Media]
    var onTapMedia: ((Media, [Media]) -> Void)?

    var body: some View {
        Group {
            if media.isEmpty {
                EmptyView()
            } else if media.count == 1 {
                single(media[0])
            } else {
                grid
            }
        }
        .tbReadableColumn()
    }

    @ViewBuilder
    private func single(_ m: Media) -> some View {
        let aspect: CGFloat = {
            guard let w = m.width, let h = m.height, w > 0, h > 0 else { return 4.0 / 3.0 }
            return CGFloat(w) / CGFloat(h)
        }()
        Button {
            onTapMedia?(m, media)
        } label: {
            Color.clear
                .frame(maxWidth: .infinity)
                .aspectRatio(max(0.4, min(2.5, aspect)), contentMode: .fit)
                .background {
                    AsyncImage(url: m.bestURL) { phase in
                        switch phase {
                        case .empty:
                            TBColor.base2
                        case .success(let image):
                            image.resizable().scaledToFill()
                        case .failure:
                            ZStack {
                                TBColor.base2
                                HeroIcon(name: "photo-solid", size: 24)
                                    .foregroundStyle(TBColor.textTertiary)
                            }
                        @unknown default:
                            TBColor.base2
                        }
                    }
                }
                .clipped()
                .clipShape(RoundedRectangle(cornerRadius: TBLayout.radiusPostRow, style: .continuous))
                .overlay(alignment: .topTrailing) {
                    if let alt = m.altText, !alt.isEmpty {
                        Text("ALT")
                            .font(TBTypography.micro.weight(.bold))
                            .padding(.horizontal, 6).padding(.vertical, 2)
                            .background(TBColor.inverse.opacity(0.72), in: RoundedRectangle(cornerRadius: 4, style: .continuous))
                            .foregroundStyle(TBColor.textOnInverse)
                            .padding(8)
                    }
                }
                .accessibilityLabel(m.altText ?? "Image")
        }
        .buttonStyle(.plain)
        .disabled(onTapMedia == nil)
        .accessibilityHint(onTapMedia == nil ? "" : "Opens full screen")
    }

    private var grid: some View {
        let columns = [GridItem(.flexible(), spacing: 4), GridItem(.flexible(), spacing: 4)]
        return LazyVGrid(columns: columns, spacing: 4) {
            ForEach(media) { m in
                Button {
                    onTapMedia?(m, media)
                } label: {
                    AsyncImage(url: m.thumbURL) { phase in
                        switch phase {
                        case .empty:
                            TBColor.base2
                        case .success(let image):
                            image.resizable().scaledToFill()
                        case .failure:
                            TBColor.base2
                        @unknown default:
                            TBColor.base2
                        }
                    }
                    .frame(height: 140)
                    .clipShape(RoundedRectangle(cornerRadius: TBLayout.radiusMD, style: .continuous))
                    .accessibilityLabel(m.altText ?? "Image")
                }
                .buttonStyle(.plain)
                .disabled(onTapMedia == nil)
                .accessibilityHint(onTapMedia == nil ? "" : "Opens full screen")
            }
        }
    }
}
