import SwiftUI

#if DEBUG
@MainActor
struct TBPreviewModifier: ViewModifier {
    let env: AppEnvironment
    let colorScheme: ColorScheme?

    init(
        authState: AuthState,
        colorScheme: ColorScheme?,
        pendingTwoFactor: TwoFactorPending?
    ) {
        TBTheme.apply()
        let e = PreviewBootstrap.environment(authState: authState)
        if let pendingTwoFactor {
            e.auth.pendingTwoFactor = pendingTwoFactor
        }
        self.env = e
        self.colorScheme = colorScheme
    }

    func body(content: Content) -> some View {
        content
            .environment(env)
            .environment(env.auth)
            .tbChrome()
            .preferredColorScheme(colorScheme)
    }
}

extension View {
    func tbPreview(
        authState: AuthState,
        colorScheme: ColorScheme? = nil,
        pendingTwoFactor: TwoFactorPending? = nil
    ) -> some View {
        modifier(
            TBPreviewModifier(
                authState: authState,
                colorScheme: colorScheme,
                pendingTwoFactor: pendingTwoFactor
            )
        )
    }
}
#else
enum PreviewModifiersUnavailable {}
#endif
