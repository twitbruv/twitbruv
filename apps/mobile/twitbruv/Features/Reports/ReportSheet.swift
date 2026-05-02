import SwiftUI

enum ReportSubject: Identifiable, Hashable {
    case post(id: String)
    case user(handle: String, id: String)

    var id: String {
        switch self {
        case .post(let id): return "post-\(id)"
        case .user(_, let id): return "user-\(id)"
        }
    }

    var subjectType: String {
        switch self {
        case .post: return "post"
        case .user: return "user"
        }
    }

    var subjectId: String {
        switch self {
        case .post(let id): return id
        case .user(_, let id): return id
        }
    }

    var label: String {
        switch self {
        case .post: return "this post"
        case .user(let handle, _): return "@\(handle)"
        }
    }
}

struct ReportSheet: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss

    let subject: ReportSubject

    @State private var reason: String = "abuse"
    @State private var details: String = ""
    @State private var isSubmitting = false
    @State private var sent = false
    @State private var errorMessage: String?

    private let reasons: [(id: String, label: String)] = [
        ("abuse", "Abuse or harassment"),
        ("spam", "Spam"),
        ("violence", "Violence or self-harm"),
        ("nsfw", "Adult content not labeled"),
        ("impersonation", "Impersonation"),
        ("other", "Other")
    ]

    var body: some View {
        NavigationStack {
            Form {
                Section("Reporting \(subject.label)") {
                    Picker("Reason", selection: $reason) {
                        ForEach(reasons, id: \.id) { item in
                            Text(item.label).tag(item.id)
                        }
                    }
                    TextField("Details (optional)", text: $details, axis: .vertical)
                        .lineLimit(3...6)
                }
                if sent {
                    Section {
                        Label("Report submitted", systemImage: "checkmark.circle.fill")
                            .foregroundStyle(.green)
                    }
                }
                if let errorMessage {
                    Section {
                        Text(errorMessage).foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle("Report")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(sent ? "Done" : "Submit") {
                        if sent { dismiss() }
                        else { Task { await submit() } }
                    }
                    .disabled(isSubmitting)
                }
            }
        }
    }

    private func submit() async {
        isSubmitting = true
        defer { isSubmitting = false }
        do {
            try await env.api.sendVoid(
                API.Reports.create(),
                body: ReportBody(
                    subjectType: subject.subjectType,
                    subjectId: subject.subjectId,
                    reason: reason,
                    details: details.isEmpty ? nil : details
                )
            )
            sent = true
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
