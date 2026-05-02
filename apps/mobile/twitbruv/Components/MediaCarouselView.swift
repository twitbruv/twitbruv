import SwiftUI

struct MediaCarouselView: View {
    let media: [Media]

    var body: some View {
        if media.isEmpty {
            EmptyView()
        } else if media.count == 1 {
            single(media[0])
        } else {
            grid
        }
    }

    @ViewBuilder
    private func single(_ m: Media) -> some View {
        let aspect: CGFloat = {
            guard let w = m.width, let h = m.height, w > 0, h > 0 else { return 4.0 / 3.0 }
            return CGFloat(w) / CGFloat(h)
        }()
        AsyncImage(url: m.bestURL) { phase in
            switch phase {
            case .empty:
                Color(.tertiarySystemFill)
            case .success(let image):
                image.resizable().scaledToFill()
            case .failure:
                Color(.tertiarySystemFill).overlay {
                    Image(systemName: "photo")
                        .foregroundStyle(.secondary)
                }
            @unknown default:
                Color(.tertiarySystemFill)
            }
        }
        .frame(maxWidth: .infinity)
        .aspectRatio(max(0.4, min(2.5, aspect)), contentMode: .fit)
        .clipShape(.rect(cornerRadius: 14))
        .overlay(alignment: .topTrailing) {
            if let alt = m.altText, !alt.isEmpty {
                Text("ALT")
                    .font(.caption2.weight(.bold))
                    .padding(.horizontal, 6).padding(.vertical, 2)
                    .background(.black.opacity(0.6), in: .rect(cornerRadius: 4))
                    .foregroundStyle(.white)
                    .padding(8)
            }
        }
        .accessibilityLabel(m.altText ?? "Image")
    }

    private var grid: some View {
        let columns = [GridItem(.flexible(), spacing: 4), GridItem(.flexible(), spacing: 4)]
        return LazyVGrid(columns: columns, spacing: 4) {
            ForEach(media) { m in
                AsyncImage(url: m.thumbURL) { phase in
                    switch phase {
                    case .empty:
                        Color(.tertiarySystemFill)
                    case .success(let image):
                        image.resizable().scaledToFill()
                    case .failure:
                        Color(.tertiarySystemFill)
                    @unknown default:
                        Color(.tertiarySystemFill)
                    }
                }
                .frame(height: 140)
                .clipShape(.rect(cornerRadius: 10))
                .accessibilityLabel(m.altText ?? "Image")
            }
        }
    }
}
