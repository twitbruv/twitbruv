import SwiftUI

struct AvatarView: View {
    let urlString: String?
    var size: CGFloat = 40
    var fallbackInitial: String?

    var body: some View {
        Group {
            if let urlString, let url = URL(string: urlString) {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .empty:
                        placeholder
                    case .success(let image):
                        image.resizable().scaledToFill()
                    case .failure:
                        placeholder
                    @unknown default:
                        placeholder
                    }
                }
            } else {
                placeholder
            }
        }
        .frame(width: size, height: size)
        .clipShape(.circle)
        .overlay {
            Circle()
                .strokeBorder(TBColor.borderNeutral, lineWidth: 0.5)
        }
        .accessibilityHidden(true)
    }

    private var placeholder: some View {
        ZStack {
            TBColor.base2
            if let initial = fallbackInitial?.first {
                Text(String(initial).uppercased())
                    .font(.system(size: size * 0.45, weight: .semibold))
                    .foregroundStyle(TBColor.textTertiary)
            } else {
                Image(systemName: "person.fill")
                    .font(.system(size: size * 0.5))
                    .foregroundStyle(TBColor.textTertiary)
            }
        }
    }
}
