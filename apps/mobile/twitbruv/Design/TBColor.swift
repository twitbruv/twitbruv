import SwiftUI
import UIKit

enum TBColor {
    static let base0 = Color(uiColor: UIColor.tbBase0)
    static let base1 = Color(uiColor: UIColor.tbBase1)
    static let base2 = Color(uiColor: UIColor.tbBase2)
    static let subtleFill = Color(uiColor: UIColor.tbSubtleFill)
    static let inverse = Color(uiColor: UIColor.tbInverse)
    static let textPrimary = Color(uiColor: UIColor.tbTextPrimary)
    static let textSecondary = Color(uiColor: UIColor.tbTextSecondary)
    static let textTertiary = Color(uiColor: UIColor.tbTextTertiary)
    static let textOnInverse = Color(uiColor: UIColor.tbTextOnInverse)
    static let borderNeutral = Color(uiColor: UIColor.tbBorderNeutral)
    static let borderStrong = Color(uiColor: UIColor.tbBorderStrong)
    static let danger = Color(uiColor: UIColor.tbDanger)
    static let dangerSubtle = Color(uiColor: UIColor.tbDangerSubtle)
    static let warn = Color(uiColor: UIColor.tbWarn)
    static let warnSubtle = Color(uiColor: UIColor.tbWarnSubtle)
    static let success = Color(uiColor: UIColor.tbSuccess)
    static let successSubtle = Color(uiColor: UIColor.tbSuccessSubtle)
    static let like = Color(uiColor: UIColor.tbLike)
    static let accent = Color(uiColor: UIColor.tbAccent)

    static let shadowFieldOuter = Color(uiColor: UIColor.tbShadowFieldOuter)
    static let shadowFieldInsetTop = Color(uiColor: UIColor.tbShadowFieldInsetTop)
    static let shadowFieldInsetBottom = Color(uiColor: UIColor.tbShadowFieldInsetBottom)
}

extension UIColor {
    private static func g(_ light: CGFloat, _ dark: CGFloat) -> UIColor {
        UIColor { tc in
            tc.userInterfaceStyle == .dark
                ? UIColor(white: dark, alpha: 1)
                : UIColor(white: light, alpha: 1)
        }
    }

    static let tbGray1 = g(0.9921, 0.0394)
    static let tbGray2 = g(0.9763, 0.0661)
    static let tbGray3 = g(0.9423, 0.1022)
    static let tbGray4 = g(0.9098, 0.1334)
    static let tbGray5 = g(0.8827, 0.1637)
    static let tbGray6 = g(0.8506, 0.1989)
    static let tbGray7 = g(0.8073, 0.2546)
    static let tbGray8 = g(0.7320, 0.3501)
    static let tbGray9 = g(0.5501, 0.4266)
    static let tbGray10 = g(0.5079, 0.4813)
    static let tbGray11 = g(0.3864, 0.7023)
    static let tbGray12 = g(0.0905, 0.9332)

    static let tbBase0: UIColor = tbGray4
    static let tbBase1: UIColor = tbGray2
    static let tbBase2: UIColor = tbGray1

    static let tbSubtleFill: UIColor = UIColor { tc in
        if tc.userInterfaceStyle == .dark {
            return UIColor(white: 1, alpha: 0.06)
        }
        return UIColor(white: 0, alpha: 0.04)
    }

    static let tbInverse: UIColor = UIColor { tc in
        if tc.userInterfaceStyle == .dark {
            return UIColor(white: 0.8698, alpha: 1)
        }
        return UIColor(white: 0.0905, alpha: 1)
    }

    static let tbTextPrimary: UIColor = tbGray12
    static let tbTextSecondary: UIColor = tbGray11
    static let tbTextTertiary: UIColor = tbGray9

    static let tbTextOnInverse: UIColor = UIColor { tc in
        if tc.userInterfaceStyle == .dark {
            return UIColor(white: 0.0394, alpha: 1)
        }
        return UIColor(white: 0.9921, alpha: 1)
    }

    static let tbBorderNeutral: UIColor = tbGray5
    static let tbBorderStrong: UIColor = tbGray7

    static let tbDanger: UIColor = UIColor { tc in
        if tc.userInterfaceStyle == .dark {
            return UIColor(red: 0.9452, green: 0.2652, blue: 0.2709, alpha: 1)
        }
        return UIColor(red: 0.9065, green: 0.0000, blue: 0.0571, alpha: 1)
    }

    static let tbDangerSubtle: UIColor = UIColor { tc in
        if tc.userInterfaceStyle == .dark {
            return UIColor(red: 0.2353, green: 0.0862, blue: 0.1038, alpha: 1)
        }
        return UIColor(red: 1.0000, green: 0.8978, blue: 0.9038, alpha: 1)
    }

    static let tbWarn: UIColor = UIColor { tc in
        if tc.userInterfaceStyle == .dark {
            return UIColor(red: 1.0000, green: 0.6958, blue: 0.0760, alpha: 1)
        }
        return UIColor(red: 1.0000, green: 0.6958, blue: 0.0760, alpha: 1)
    }

    static let tbWarnSubtle: UIColor = UIColor { tc in
        if tc.userInterfaceStyle == .dark {
            return UIColor(red: 0.1911, green: 0.1051, blue: 0.0000, alpha: 1)
        }
        return UIColor(red: 1.0000, green: 0.9368, blue: 0.8027, alpha: 1)
    }

    static let tbSuccess: UIColor = UIColor { tc in
        if tc.userInterfaceStyle == .dark {
            return UIColor(red: 0.0000, green: 0.6618, blue: 0.3590, alpha: 1)
        }
        return UIColor(red: 0.0000, green: 0.6121, blue: 0.3129, alpha: 1)
    }

    static let tbSuccessSubtle: UIColor = UIColor { tc in
        if tc.userInterfaceStyle == .dark {
            return UIColor(red: 0.0124, green: 0.1515, blue: 0.0752, alpha: 1)
        }
        return UIColor(red: 0.8694, green: 0.9671, blue: 0.8983, alpha: 1)
    }

    static let tbLike: UIColor = tbDanger

    static var tbAccent: UIColor { tbGray12 }

    static let tbShadowFieldOuter: UIColor = UIColor { tc in
        if tc.userInterfaceStyle == .dark {
            return UIColor(white: 1, alpha: 0.10)
        }
        return UIColor(red: 0.918, green: 0.918, blue: 0.918, alpha: 1)
    }

    static let tbShadowFieldInsetTop: UIColor = UIColor { tc in
        if tc.userInterfaceStyle == .dark {
            return UIColor(white: 1, alpha: 0.05)
        }
        return UIColor(white: 0, alpha: 0.118)
    }

    static let tbShadowFieldInsetBottom: UIColor = UIColor { tc in
        if tc.userInterfaceStyle == .dark {
            return UIColor(white: 0, alpha: 0.35)
        }
        return UIColor(white: 1, alpha: 1)
    }
}
