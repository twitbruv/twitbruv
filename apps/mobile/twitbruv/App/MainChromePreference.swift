import SwiftUI

enum MainChromePreference {
    struct HideComposeFab: PreferenceKey {
        static let defaultValue = false
        static func reduce(value: inout Bool, nextValue: () -> Bool) {
            value = value || nextValue()
        }
    }
}
