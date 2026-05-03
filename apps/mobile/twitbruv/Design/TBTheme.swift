import SwiftUI
import UIKit

enum TBTheme {
    static func apply() {
        let nav = UINavigationBarAppearance()
        nav.configureWithDefaultBackground()
        nav.backgroundEffect = UIBlurEffect(style: .systemUltraThinMaterial)
        nav.backgroundColor = UIColor.tbGlassChromeTint
        nav.titleTextAttributes = [
            .foregroundColor: UIColor.tbTextPrimary,
            .font: UIFont.systemFont(ofSize: 17, weight: .semibold),
        ]
        nav.largeTitleTextAttributes = [
            .foregroundColor: UIColor.tbTextPrimary,
        ]

        UINavigationBar.appearance().standardAppearance = nav
        UINavigationBar.appearance().scrollEdgeAppearance = nav
        UINavigationBar.appearance().compactAppearance = nav
        UINavigationBar.appearance().tintColor = UIColor.tbAccent

        let tab = UITabBarAppearance()
        tab.configureWithDefaultBackground()
        tab.backgroundEffect = UIBlurEffect(style: .systemUltraThinMaterial)
        tab.backgroundColor = UIColor.tbGlassChromeTint
        UITabBar.appearance().standardAppearance = tab
        UITabBar.appearance().scrollEdgeAppearance = tab
        UITabBar.appearance().tintColor = UIColor.tbAccent

        UITableView.appearance().backgroundColor = UIColor.tbBase1
        UITableView.appearance().separatorColor = UIColor.tbBorderNeutral
    }
}

struct TBChromeModifier: ViewModifier {
    func body(content: Content) -> some View {
        content
            .tint(TBColor.accent)
            .background {
                LinearGradient(
                    colors: [
                        TBColor.base2,
                        TBColor.base1,
                        TBColor.base0.opacity(0.62),
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
                .ignoresSafeArea()
            }
    }
}

extension View {
    func tbChrome() -> some View {
        modifier(TBChromeModifier())
    }
}
