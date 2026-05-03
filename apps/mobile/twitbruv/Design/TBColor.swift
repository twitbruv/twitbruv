import SwiftUI
import UIKit

// MARK: - Public semantic tokens

enum TBColor {
    // Backgrounds
    static let base0 = Color(uiColor: .tbBase0)
    static let base1 = Color(uiColor: .tbBase1)
    static let base2 = Color(uiColor: .tbBase2)
    static let subtleFill = Color(uiColor: .tbSubtleFill)
    static let inverse = Color(uiColor: .tbInverse)

    // Text
    static let textPrimary = Color(uiColor: .tbTextPrimary)
    static let textSecondary = Color(uiColor: .tbTextSecondary)
    static let textTertiary = Color(uiColor: .tbTextTertiary)
    static let textOnInverse = Color(uiColor: .tbTextOnInverse)

    // Borders
    static let borderNeutral = Color(uiColor: .tbBorderNeutral)
    static let borderStrong = Color(uiColor: .tbBorderStrong)

    // Status
    static let danger = Color(uiColor: .tbDanger)
    static let dangerSubtle = Color(uiColor: .tbDangerSubtle)
    static let warn = Color(uiColor: .tbWarn)
    static let warnSubtle = Color(uiColor: .tbWarnSubtle)
    static let success = Color(uiColor: .tbSuccess)
    static let successSubtle = Color(uiColor: .tbSuccessSubtle)
    static let like = Color(uiColor: .tbLike)
    static let accent = Color(uiColor: .tbAccent)

    // Glass
    static let glassChromeTint = Color(uiColor: .tbGlassChromeTint)
    static let glassPanelTint = Color(uiColor: .tbGlassPanelTint)
    static let glassCardTint = Color(uiColor: .tbGlassCardTint)
    static let glassFieldTint = Color(uiColor: .tbGlassFieldTint)
    static let glassProminentTint = Color(uiColor: .tbGlassProminentTint)
    static let glassStroke = Color(uiColor: .tbGlassStroke)
    static let glassHighlight = Color(uiColor: .tbGlassHighlight)
    static let glassShadow = Color(uiColor: .tbGlassShadow)

    // Field shadows
    static let shadowFieldOuter = Color(uiColor: .tbShadowFieldOuter)
    static let shadowFieldInsetTop = Color(uiColor: .tbShadowFieldInsetTop)
    static let shadowFieldInsetBottom = Color(uiColor: .tbShadowFieldInsetBottom)
}

// MARK: - Gray scale (12-step, matches web scales.css)
//
// Semantic step conventions (Radix-style):
//   1-2:   Backgrounds
//   3-5:   Component backgrounds (default, hover, active)
//   6-8:   Borders (subtle, default, strong)
//   9-10:  Solid fills (default, hover)
//   11:    Low-contrast text
//   12:    High-contrast text

private extension UIColor {
    static func adaptive(light: CGFloat, dark: CGFloat) -> UIColor {
        UIColor { tc in
            tc.userInterfaceStyle == .dark
                ? UIColor(white: dark, alpha: 1)
                : UIColor(white: light, alpha: 1)
        }
    }

    static func adaptive(light: UIColor, dark: UIColor) -> UIColor {
        UIColor { tc in tc.userInterfaceStyle == .dark ? dark : light }
    }
}

extension UIColor {
    // Gray scale — pure neutral, 12 steps.
    // Values converted from the OKLCH scale in scales.css.
    static let gray1  = adaptive(light: 0.992, dark: 0.039)
    static let gray2  = adaptive(light: 0.976, dark: 0.066)
    static let gray3  = adaptive(light: 0.942, dark: 0.102)
    static let gray4  = adaptive(light: 0.910, dark: 0.133)
    static let gray5  = adaptive(light: 0.883, dark: 0.164)
    static let gray6  = adaptive(light: 0.851, dark: 0.199)
    static let gray7  = adaptive(light: 0.807, dark: 0.255)
    static let gray8  = adaptive(light: 0.732, dark: 0.350)
    static let gray9  = adaptive(light: 0.550, dark: 0.427)
    static let gray10 = adaptive(light: 0.508, dark: 0.481)
    static let gray11 = adaptive(light: 0.386, dark: 0.702)
    static let gray12 = adaptive(light: 0.091, dark: 0.933)

    // Red scale (danger / like)
    static let red9  = adaptive(
        light: UIColor(red: 0.907, green: 0.000, blue: 0.057, alpha: 1),
        dark:  UIColor(red: 0.945, green: 0.265, blue: 0.271, alpha: 1)
    )
    static let red3  = adaptive(
        light: UIColor(red: 1.000, green: 0.898, blue: 0.904, alpha: 1),
        dark:  UIColor(red: 0.235, green: 0.086, blue: 0.104, alpha: 1)
    )
    static let red11 = adaptive(
        light: UIColor(red: 0.750, green: 0.100, blue: 0.130, alpha: 1),
        dark:  UIColor(red: 0.945, green: 0.450, blue: 0.460, alpha: 1)
    )

    // Amber scale (warning)
    static let amber9 = adaptive(
        light: UIColor(red: 1.000, green: 0.696, blue: 0.076, alpha: 1),
        dark:  UIColor(red: 1.000, green: 0.696, blue: 0.076, alpha: 1)
    )
    static let amber3 = adaptive(
        light: UIColor(red: 1.000, green: 0.937, blue: 0.803, alpha: 1),
        dark:  UIColor(red: 0.191, green: 0.105, blue: 0.000, alpha: 1)
    )

    // Green scale (success)
    static let green9 = adaptive(
        light: UIColor(red: 0.000, green: 0.612, blue: 0.313, alpha: 1),
        dark:  UIColor(red: 0.000, green: 0.662, blue: 0.359, alpha: 1)
    )
    static let green3 = adaptive(
        light: UIColor(red: 0.869, green: 0.967, blue: 0.898, alpha: 1),
        dark:  UIColor(red: 0.012, green: 0.152, blue: 0.075, alpha: 1)
    )

    // MARK: - Semantic tokens (reference scale steps)

    // Backgrounds
    static let tbBase0: UIColor = gray4
    static let tbBase1: UIColor = gray2
    static let tbBase2: UIColor = gray1

    static let tbSubtleFill: UIColor = adaptive(
        light: UIColor(white: 0, alpha: 0.04),
        dark:  UIColor(white: 1, alpha: 0.06)
    )

    static let tbInverse: UIColor = adaptive(
        light: gray12,
        dark:  UIColor(white: 0.950, alpha: 1)
    )

    // Text
    static let tbTextPrimary: UIColor = gray12
    static let tbTextSecondary: UIColor = gray11
    static let tbTextTertiary: UIColor = gray9

    static let tbTextOnInverse: UIColor = adaptive(
        light: gray1,
        dark:  UIColor(white: 0.039, alpha: 1)
    )

    // Borders
    static let tbBorderNeutral: UIColor = gray5
    static let tbBorderStrong: UIColor = gray7

    // Status
    static let tbDanger: UIColor = red9
    static let tbDangerSubtle: UIColor = red3
    static let tbWarn: UIColor = amber9
    static let tbWarnSubtle: UIColor = amber3
    static let tbSuccess: UIColor = green9
    static let tbSuccessSubtle: UIColor = green3
    static let tbLike: UIColor = red9
    static var tbAccent: UIColor { gray12 }

    // MARK: - Glass tokens

    static let tbGlassChromeTint: UIColor = adaptive(
        light: UIColor(white: 1, alpha: 0.28),
        dark:  UIColor(white: 0.03, alpha: 0.24)
    )

    static let tbGlassPanelTint: UIColor = adaptive(
        light: UIColor(white: 1, alpha: 0.34),
        dark:  UIColor(white: 0.08, alpha: 0.28)
    )

    static let tbGlassCardTint: UIColor = adaptive(
        light: UIColor(white: 1, alpha: 0.20),
        dark:  UIColor(white: 0.10, alpha: 0.18)
    )

    static let tbGlassFieldTint: UIColor = adaptive(
        light: UIColor(white: 1, alpha: 0.38),
        dark:  UIColor(white: 0.12, alpha: 0.30)
    )

    static let tbGlassProminentTint: UIColor = adaptive(
        light: UIColor(white: 0.05, alpha: 0.14),
        dark:  UIColor(white: 0.05, alpha: 0.14)
    )

    static let tbGlassStroke: UIColor = adaptive(
        light: UIColor(white: 1, alpha: 0.70),
        dark:  UIColor(white: 1, alpha: 0.16)
    )

    static let tbGlassHighlight: UIColor = adaptive(
        light: UIColor(white: 1, alpha: 0.92),
        dark:  UIColor(white: 1, alpha: 0.20)
    )

    static let tbGlassShadow: UIColor = adaptive(
        light: UIColor(white: 0.35, alpha: 1),
        dark:  UIColor(white: 0, alpha: 1)
    )

    // MARK: - Field shadow tokens

    static let tbShadowFieldOuter: UIColor = adaptive(
        light: UIColor(red: 0.918, green: 0.918, blue: 0.918, alpha: 1),
        dark:  UIColor(white: 1, alpha: 0.10)
    )

    static let tbShadowFieldInsetTop: UIColor = adaptive(
        light: UIColor(white: 0, alpha: 0.118),
        dark:  UIColor(white: 1, alpha: 0.05)
    )

    static let tbShadowFieldInsetBottom: UIColor = adaptive(
        light: UIColor(white: 1, alpha: 1),
        dark:  UIColor(white: 0, alpha: 0.35)
    )
}
