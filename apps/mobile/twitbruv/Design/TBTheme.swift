import SwiftUI
import UIKit

enum TBTheme {
    static func apply() {
        let nav = UINavigationBarAppearance()
        nav.configureWithTransparentBackground()
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
        UINavigationBar.appearance().compactScrollEdgeAppearance = nav
        UINavigationBar.appearance().tintColor = UIColor.tbTextPrimary

        let tab = UITabBarAppearance()
        tab.configureWithOpaqueBackground()
        tab.backgroundColor = UIColor.tbBase1

        let tabItem = UITabBarItemAppearance()
        tabItem.normal.titleTextAttributes = [
            .font: UIFont.systemFont(
                ofSize: TBLayout.tabBarTitlePointSize,
                weight: .medium
            ),
            .foregroundColor: UIColor.tbTextSecondary,
        ]
        tabItem.selected.titleTextAttributes = [
            .font: UIFont.systemFont(
                ofSize: TBLayout.tabBarTitlePointSize,
                weight: .semibold
            ),
            .foregroundColor: UIColor.tbAccent,
        ]
        tabItem.normal.iconColor = UIColor.tbTextSecondary
        tabItem.selected.iconColor = UIColor.tbAccent
        tab.stackedLayoutAppearance = tabItem
        tab.inlineLayoutAppearance = tabItem
        tab.compactInlineLayoutAppearance = tabItem

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
            .toolbarBackground(.hidden, for: .navigationBar)
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
