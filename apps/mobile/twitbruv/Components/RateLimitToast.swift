import SwiftUI

struct RateLimitToast: View {
    @Environment(AppEnvironment.self) private var env
    @State private var remaining: Int = 0
    @State private var ticker: Timer?

    var body: some View {
        Group {
            if let notice = env.rateLimit, remaining > 0 {
                HStack(spacing: 12) {
                    Image(systemName: "hourglass")
                    VStack(alignment: .leading) {
                        Text("Slow down")
                            .font(.callout.weight(.semibold))
                        Text(
                            notice.bucket.map { "\($0) — try in \(remaining)s" }
                                ?? "Try in \(remaining)s"
                        )
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    }
                    Spacer()
                    Button {
                        env.clearRateLimit()
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundStyle(.secondary)
                    }
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(.thinMaterial, in: .rect(cornerRadius: 14))
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
                    Image(systemName: "wrench.and.screwdriver.fill")
                    Text("Maintenance — some actions may fail.")
                        .font(.footnote.weight(.medium))
                    Spacer()
                    Button("Retry") {
                        env.isMaintenance = false
                        Task { await env.bootstrap() }
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .background(.thinMaterial)
                .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .animation(.snappy, value: env.isMaintenance)
    }
}
