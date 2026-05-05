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
        ("other", "Other"),
    ]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    Text("Reporting \(subject.label)")
                        .font(TBTypography.label)
                        .foregroundStyle(TBColor.textSecondary)

                    VStack(alignment: .leading, spacing: 6) {
                        Text("Reason")
                            .font(TBTypography.label)
                            .foregroundStyle(TBColor.textPrimary)
                        Picker("Reason", selection: $reason) {
                            ForEach(reasons, id: \.id) { item in
                                Text(item.label).tag(item.id)
                            }
                        }
                        .pickerStyle(.menu)
                        .tint(TBColor.accent)
                    }

                    VStack(alignment: .leading, spacing: 6) {
                        Text("Details (optional)")
                            .font(TBTypography.label)
                            .foregroundStyle(TBColor.textPrimary)
                        ZStack(alignment: .topLeading) {
                            TextField("", text: $details, axis: .vertical)
                                .font(TBTypography.body)
                                .foregroundStyle(TBColor.textPrimary)
                                .lineLimit(3...6)
                                .padding(12)
                        }
                        .tbGlass(
                            .field,
                            in: RoundedRectangle(cornerRadius: TBLayout.radiusGlassCard, style: .continuous),
                            interactive: true,
                            shadow: false
                        )
                    }

                    if sent {
                        Label("Report submitted", hero: "check-circle-solid")
                            .font(TBTypography.meta.weight(.medium))
                            .foregroundStyle(TBColor.success)
                    }

                    if let errorMessage {
                        Text(errorMessage)
                            .font(TBTypography.meta)
                            .foregroundStyle(TBColor.danger)
                    }
                }
                .padding(TBLayout.pagePadding)
            }
            .background(Color.clear)
            .navigationTitle("Report")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .foregroundStyle(TBColor.textSecondary)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(sent ? "Done" : "Submit") {
                        if sent { dismiss() }
                        else { Task { await submit() } }
                    }
                    .fontWeight(.semibold)
                    .foregroundStyle(TBColor.accent)
                    .disabled(isSubmitting)
                }
            }
            .presentationBackground(.ultraThinMaterial)
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
