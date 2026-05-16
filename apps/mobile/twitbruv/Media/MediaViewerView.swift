import SwiftUI

struct MediaViewerItem: Identifiable, Hashable {
    let media: [Media]
    let initialID: String

    var id: String { initialID }
}

struct MediaViewerView: View {
    @Environment(\.dismiss) private var dismiss

    let media: [Media]
    let initialID: String

    @State private var selection: String

    init(media: [Media], initialID: String) {
        self.media = media
        self.initialID = initialID
        self._selection = State(initialValue: initialID)
    }

    var body: some View {
        ZStack(alignment: .topTrailing) {
            Color.black.ignoresSafeArea()
            TabView(selection: $selection) {
                ForEach(media) { item in
                    ZoomableMediaPage(media: item)
                        .tag(item.id)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: media.count > 1 ? .automatic : .never))
            .ignoresSafeArea()

            HStack(spacing: 10) {
                if let selected = media.first(where: { $0.id == selection }),
                   let url = selected.bestURL
                {
                    ShareLink(item: url) {
                        HeroIcon(name: "arrow-up-circle-solid", size: 22)
                            .foregroundStyle(.white)
                            .frame(width: TBLayout.hitTarget, height: TBLayout.hitTarget)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Share image")
                }
                TBToolbarIconButton(
                    icon: "xmark-solid",
                    accessibilityLabel: "Close media viewer",
                    tint: .white
                ) {
                    dismiss()
                }
            }
            .padding(.top, 12)
            .padding(.trailing, TBLayout.pagePadding)
        }
    }
}

private struct ZoomableMediaPage: View {
    let media: Media

    @State private var scale: CGFloat = 1

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            AsyncImage(url: media.bestURL) { phase in
                switch phase {
                case .empty:
                    ProgressView()
                        .tint(.white)
                case .success(let image):
                    image
                        .resizable()
                        .scaledToFit()
                        .scaleEffect(scale)
                        .gesture(
                            MagnifyGesture()
                                .onChanged { value in
                                    scale = min(4, max(1, value.magnification))
                                }
                                .onEnded { _ in
                                    withAnimation(.spring(response: 0.24, dampingFraction: 0.82)) {
                                        scale = 1
                                    }
                                }
                        )
                case .failure:
                    VStack(spacing: 10) {
                        HeroIcon(name: "photo-solid", size: 32)
                            .foregroundStyle(.white.opacity(0.7))
                        Text("Image could not be loaded")
                            .font(TBTypography.meta)
                            .foregroundStyle(.white.opacity(0.86))
                    }
                @unknown default:
                    EmptyView()
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)

            if let alt = media.altText, !alt.isEmpty {
                Text(alt)
                    .font(TBTypography.caption)
                    .foregroundStyle(.white)
                    .lineLimit(3)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(.black.opacity(0.5), in: RoundedRectangle(cornerRadius: 8))
                    .padding(TBLayout.pagePadding)
            }
        }
        .accessibilityLabel(media.altText ?? "Image")
    }
}

