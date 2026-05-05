import SwiftUI
import UIKit

/// SwiftUI wrapper around a Heroicon vector asset.
///
/// Asset names are kebab-case with a `-solid` or `-outline` suffix, e.g.
/// `heart-solid`, `chat-bubble-left-outline`. Icons live in
/// `Assets.xcassets/Heroicons/<name>.imageset/`.
///
/// Tinting works via `.foregroundStyle(...)` because each imageset declares
/// `template-rendering-intent: template`.
struct HeroIcon: View {
    let name: String
    var size: CGFloat = 16

    var body: some View {
        Image(name)
            .renderingMode(.template)
            .resizable()
            .scaledToFit()
            .frame(width: size, height: size)
    }
}

extension Image {
    /// Returns a Heroicon `Image` ready for inline use. The caller is
    /// responsible for sizing via `.resizable().frame(...)` or applying
    /// `.font(...)` (font sizing does not affect raster images).
    static func hero(_ name: String) -> Image {
        Image(name).renderingMode(.template)
    }
}

extension UIImage {
    /// Loads a Heroicon asset as a tintable `UIImage` for UIKit consumers
    /// (tab bar items, navigation bar items, etc).
    static func hero(_ name: String, pointSize: CGFloat? = nil) -> UIImage? {
        guard let base = UIImage(named: name)?.withRenderingMode(.alwaysTemplate)
        else { return nil }
        guard let pointSize else { return base }
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: pointSize, height: pointSize))
        return renderer.image { _ in
            base.draw(in: CGRect(x: 0, y: 0, width: pointSize, height: pointSize))
        }
        .withRenderingMode(.alwaysTemplate)
    }
}

extension Label where Title == Text, Icon == HeroIcon {
    /// Creates a SwiftUI `Label` whose icon is a Heroicon asset.
    /// Use anywhere you'd otherwise pass `systemImage:`.
    init(_ title: String, hero: String, iconSize: CGFloat = 16) {
        self.init {
            Text(title)
        } icon: {
            HeroIcon(name: hero, size: iconSize)
        }
    }
}
