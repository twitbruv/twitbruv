import SwiftUI

#if DEBUG
struct DevDiagnosticsView: View {
    @Environment(AppEnvironment.self) private var env

    var body: some View {
        List {
            Section("Checks") {
                Button {
                    Task { await env.devTools.runDiagnostics() }
                } label: {
                    Label("Run diagnostics", systemImage: "stethoscope")
                }

                Button {
                    Task {
                        let seeded = await env.devTools.seedLocalData()
                        if seeded {
                            await env.devTools.runDiagnostics()
                        }
                    }
                } label: {
                    if env.devTools.isSeeding {
                        ProgressView()
                    } else {
                        Label("Seed local data", systemImage: "leaf")
                    }
                }
            }

            Section("Results") {
                if env.devTools.diagnostics.isEmpty {
                    Text("No diagnostics yet.")
                        .foregroundStyle(TBColor.textSecondary)
                }
                ForEach(env.devTools.diagnostics) { line in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(line.label)
                            .font(TBTypography.caption.weight(.semibold))
                            .foregroundStyle(TBColor.textSecondary)
                        Text(line.value)
                            .font(.system(size: 14, design: .monospaced))
                            .foregroundStyle(TBColor.textPrimary)
                            .textSelection(.enabled)
                    }
                    .padding(.vertical, 2)
                }
            }

            if let seedMessage = env.devTools.seedMessage {
                Section("Last seed") {
                    Text(seedMessage)
                        .textSelection(.enabled)
                }
            }
        }
        .navigationTitle("API diagnostics")
        .scrollContentBackground(.hidden)
        .background(Color.clear)
        .task {
            if env.devTools.diagnostics.isEmpty {
                await env.devTools.runDiagnostics()
            }
        }
    }
}
#endif
