import SwiftUI

struct TBScreen<Header: View, Content: View>: View {
    var maxWidth: CGFloat = TBLayout.feedMaxWidth
    @ViewBuilder var header: () -> Header
    @ViewBuilder var content: () -> Content

    var body: some View {
        ZStack {
            TBColor.base1
                .ignoresSafeArea()
            VStack(spacing: 0) {
                header()
                content()
                    .frame(maxWidth: maxWidth)
                    .frame(maxWidth: .infinity)
            }
        }
    }
}

extension TBScreen where Header == EmptyView {
    init(
        maxWidth: CGFloat = TBLayout.feedMaxWidth,
        @ViewBuilder content: @escaping () -> Content
    ) {
        self.maxWidth = maxWidth
        self.header = { EmptyView() }
        self.content = content
    }
}

struct TBListChromeModifier: ViewModifier {
    var rowSpacing: CGFloat = TBLayout.feedListRowSpacing

    func body(content: Content) -> some View {
        content
            .listRowSpacing(rowSpacing)
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .background(Color.clear)
            .tbReadableColumn()
    }
}

extension View {
    func tbListChrome(rowSpacing: CGFloat = TBLayout.feedListRowSpacing) -> some View {
        modifier(TBListChromeModifier(rowSpacing: rowSpacing))
    }
}

struct TBToolbarIconButton: View {
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency

    let icon: String
    let accessibilityLabel: String
    var size: CGFloat = TBLayout.hitTarget
    var iconSize: CGFloat = 18
    var tint: Color = TBColor.textPrimary
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            HeroIcon(name: icon, size: iconSize)
                .foregroundStyle(tint)
                .frame(width: size, height: size)
                .background {
                    if reduceTransparency {
                        Circle()
                            .fill(TBColor.base2)
                            .overlay {
                                Circle().strokeBorder(TBColor.glassStroke, lineWidth: 0.6)
                            }
                    } else {
                        Circle().fill(.clear)
                            .glassEffect(Glass.clear.interactive(), in: Circle())
                    }
                }
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(accessibilityLabel)
    }
}

struct TBInlineState: View {
    enum Kind {
        case loading(String?)
        case empty(icon: String, title: String, message: String?)
        case error(String)
    }

    let kind: Kind
    var retryTitle: String? = nil
    var retry: (() -> Void)? = nil

    var body: some View {
        VStack(spacing: 14) {
            switch kind {
            case .loading(let title):
                ProgressView()
                    .tint(TBColor.accent)
                if let title {
                    Text(title)
                        .font(TBTypography.meta.weight(.medium))
                        .foregroundStyle(TBColor.textSecondary)
                }
            case .empty(let icon, let title, let message):
                TBEmptyState(icon: icon, title: title, message: message)
                    .padding(.horizontal, -TBLayout.pagePadding)
            case .error(let message):
                ErrorBanner(message: message) {
                    retry?()
                }
            }

            if let retryTitle, let retry {
                TBButton(title: retryTitle, style: .secondary, expands: false, action: retry)
            }
        }
        .padding(.vertical, 24)
        .frame(maxWidth: .infinity)
    }
}

