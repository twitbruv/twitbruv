import SwiftUI

struct RateLimitToast: View {
    @Environment(AppEnvironment.self) private var env
    @State private var remaining: Int = 0
    @State private var ticker: Timer?

    var body: some View {
        Group {
            if let notice = env.rateLimit, remaining > 0 {
                HStack(spacing: 12) {
                    HeroIcon(name: "clock-solid", size: 18)
                        .foregroundStyle(TBColor.warn)
                    VStack(alignment: .leading) {
                        Text("Slow down")
                            .font(TBTypography.meta.weight(.semibold))
                            .foregroundStyle(TBColor.textPrimary)
                        Text(
                            notice.bucket.map { "\($0) — try in \(remaining)s" }
                                ?? "Try in \(remaining)s"
                        )
                        .font(TBTypography.caption)
                        .foregroundStyle(TBColor.textSecondary)
                    }
                    Spacer()
                    Button {
                        env.clearRateLimit()
                    } label: {
                        HeroIcon(name: "xcircle-solid", size: 18)
                            .foregroundStyle(TBColor.textTertiary)
                    }
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .tbGlass(
                    .chrome,
                    in: RoundedRectangle(cornerRadius: 14, style: .continuous)
                )
                .padding(.horizontal)
                .padding(.bottom, 12)
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.snappy, value: env.rateLimit)
        .onChange(of: env.rateLimit) { _, new in
            ticker?.invalidate()
            ticker = nil
            if let new {
                remaining = new.retryAfterSec
                let timer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { _ in
                    Task { @MainActor in
                        tick()
                    }
                }
                ticker = timer
            } else {
                remaining = 0
            }
        }
    }

    private func tick() {
        remaining -= 1
        if remaining <= 0 {
            ticker?.invalidate()
            ticker = nil
            env.clearRateLimit()
        }
    }
}

struct MaintenanceBannerView: View {
    @Environment(AppEnvironment.self) private var env

    var body: some View {
        Group {
            if env.isMaintenance {
                HStack(spacing: 8) {
                    HeroIcon(name: "wrench-screwdriver-solid", size: 14)
                        .foregroundStyle(TBColor.textTertiary)
                    Text("Maintenance — some actions may fail.")
                        .font(TBTypography.caption.weight(.medium))
                        .foregroundStyle(TBColor.textPrimary)
                    Spacer()
                    Button("Retry") {
                        env.isMaintenance = false
                        Task { await env.bootstrap() }
                    }
                    .font(TBTypography.caption.weight(.semibold))
                    .foregroundStyle(TBColor.accent)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .background(TBColor.base1)
                .overlay(alignment: .bottom) {
                    Rectangle()
                        .fill(TBColor.glassStroke)
                        .frame(height: 0.5)
                }
                .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .animation(.snappy, value: env.isMaintenance)
    }
}
