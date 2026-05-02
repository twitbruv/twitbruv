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
                        .foregroundStyle(.secondary)
                }
                ForEach(env.devTools.diagnostics) { line in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(line.label)
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.secondary)
                        Text(line.value)
                            .font(.callout.monospaced())
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
        .task {
            if env.devTools.diagnostics.isEmpty {
                await env.devTools.runDiagnostics()
            }
        }
    }
}
#endif
