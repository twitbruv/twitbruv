import Observation
import SwiftUI

enum TBToastKind: Equatable {
    case success
    case error
}

struct TBToastMessage: Equatable, Identifiable {
    let id = UUID()
    var text: String
    var kind: TBToastKind
}

@Observable
@MainActor
final class TBToastStore {
    var message: TBToastMessage?
    private var dismissTask: Task<Void, Never>?

    func show(_ text: String, kind: TBToastKind = .success) {
        dismissTask?.cancel()
        message = TBToastMessage(text: text, kind: kind)
        dismissTask = Task { @MainActor in
            try? await Task.sleep(for: .seconds(2.4))
            withAnimation(.easeOut(duration: 0.18)) {
                message = nil
            }
        }
    }

    func clear() {
        dismissTask?.cancel()
        message = nil
    }
}

struct TBActionToast: View {
    let message: TBToastMessage

    var body: some View {
        HStack(spacing: 10) {
            HeroIcon(
                name: message.kind == .success ? "check-circle-solid" : "exclamation-triangle-solid",
                size: 18
            )
            .foregroundStyle(message.kind == .success ? TBColor.success : TBColor.danger)
            Text(message.text)
                .font(TBTypography.meta.weight(.medium))
                .foregroundStyle(TBColor.textPrimary)
                .lineLimit(2)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .tbGlass(
            .chrome,
            in: RoundedRectangle(cornerRadius: 14, style: .continuous)
        )
        .padding(.horizontal, TBLayout.pagePadding)
        .transition(.move(edge: .bottom).combined(with: .opacity))
    }
}
