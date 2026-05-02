import SwiftUI

struct ScheduledPostsView: View {
    @Environment(AppEnvironment.self) private var env

    @State private var items: [ScheduledPost] = []
    @State private var kind: String = "scheduled"
    @State private var isLoading = false
    @State private var editing: ScheduledPost?

    var body: some View {
        List {
            Section {
                Picker("Kind", selection: Binding(
                    get: { kind },
                    set: { new in
                        kind = new
                        Task { await load() }
                    }
                )) {
                    Text("Scheduled").tag("scheduled")
                    Text("Drafts").tag("draft")
                }
                .pickerStyle(.segmented)
            }

            if items.isEmpty && !isLoading {
                EmptyStateView(
                    icon: "calendar",
                    title: kind == "draft" ? "No drafts yet" : "No scheduled posts",
                    message: nil
                )
                .listRowSeparator(.hidden)
            }

            ForEach(items) { item in
                ScheduledRow(item: item)
                    .swipeActions(edge: .trailing) {
                        Button(role: .destructive) {
                            Task { await delete(item) }
                        } label: { Label("Delete", systemImage: "trash") }
                        Button {
                            Task { await publish(item) }
                        } label: { Label("Publish", systemImage: "paperplane") }
                            .tint(.green)
                    }
                    .onTapGesture {
                        editing = item
                    }
            }
        }
        .navigationTitle("Scheduled")
        .refreshable { await load() }
        .task { await load() }
        .sheet(item: $editing) { item in
            ScheduledEditorView(item: item) {
                Task { await load() }
            }
        }
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            let response: ScheduledPostsResponse = try await env.api.get(
                API.ScheduledPosts.list(kind: kind)
            )
            items = response.values
        } catch {}
    }

    private func delete(_ item: ScheduledPost) async {
        do {
            try await env.api.sendVoid(API.ScheduledPosts.delete(item.id))
            items.removeAll { $0.id == item.id }
        } catch {}
    }

    private func publish(_ item: ScheduledPost) async {
        do {
            try await env.api.sendVoid(API.ScheduledPosts.publish(item.id))
            items.removeAll { $0.id == item.id }
        } catch {}
    }
}

private struct ScheduledRow: View {
    let item: ScheduledPost

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(item.text).lineLimit(3)
            HStack {
                if let date = item.scheduledAt {
                    Label(
                        date.formatted(date: .abbreviated, time: .shortened),
                        systemImage: "calendar"
                    )
                }
                Spacer()
                Text(item.kind).font(.caption)
                    .padding(.horizontal, 6).padding(.vertical, 2)
                    .background(Color(.tertiarySystemFill), in: .capsule)
            }
            .font(.caption)
            .foregroundStyle(.secondary)
        }
        .padding(.vertical, 4)
    }
}

struct ScheduledEditorView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss

    let item: ScheduledPost
    var onChange: () -> Void

    @State private var text: String
    @State private var scheduledAt: Date
    @State private var isSaving = false
    @State private var errorMessage: String?

    init(item: ScheduledPost, onChange: @escaping () -> Void) {
        self.item = item
        self.onChange = onChange
        _text = State(initialValue: item.text)
        _scheduledAt = State(initialValue: item.scheduledAt ?? .now.addingTimeInterval(3600))
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Content") {
                    TextEditor(text: $text)
                        .frame(minHeight: 120)
                }
                Section("When") {
                    DatePicker(
                        "Schedule",
                        selection: $scheduledAt,
                        in: Date()...,
                        displayedComponents: [.date, .hourAndMinute]
                    )
                }
                if let errorMessage {
                    Section {
                        Text(errorMessage).foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle("Edit scheduled")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { Task { await save() } }
                        .disabled(isSaving || text.isEmpty)
                }
                ToolbarItem(placement: .destructiveAction) {
                    Button("Publish now") { Task { await publish() } }
                        .disabled(isSaving)
                }
            }
        }
    }

    private func save() async {
        isSaving = true
        defer { isSaving = false }
        do {
            let body = ScheduledPostBody(
                kind: item.kind,
                text: text,
                mediaIds: item.mediaIds,
                visibility: item.visibility,
                sensitive: item.sensitive,
                contentWarning: item.contentWarning,
                replyRestriction: item.replyRestriction,
                scheduledAt: scheduledAt
            )
            let _: ScheduledPostResponse = try await env.api.send(
                API.ScheduledPosts.update(item.id), body: body
            )
            onChange()
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func publish() async {
        isSaving = true
        defer { isSaving = false }
        do {
            try await env.api.sendVoid(API.ScheduledPosts.publish(item.id))
            onChange()
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
