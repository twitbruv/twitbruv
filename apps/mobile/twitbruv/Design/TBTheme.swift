import SwiftUI
import UIKit

enum TBTheme {
    static func apply() {
        let nav = UINavigationBarAppearance()
        nav.configureWithOpaqueBackground()
        nav.backgroundColor = UIColor.tbBase1
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
        tab.configureWithOpaqueBackground()
        tab.backgroundColor = UIColor.tbBase1
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
            .background(TBColor.base1)
    }
}

extension View {
    func tbChrome() -> some View {
        modifier(TBChromeModifier())
    }
}
