import SwiftUI

struct ScheduledPostsView: View {
    @Environment(AppEnvironment.self) private var env

    @State private var items: [ScheduledPost] = []
    @State private var kind: String = "scheduled"
    @State private var isLoading = false
    @State private var editing: ScheduledPost?
    @State private var errorMessage: String?

    var body: some View {
        List {
            Section {
                TBFeedSegmented(
                    selection: $kind,
                    options: [
                        ("Scheduled", "scheduled"),
                        ("Drafts", "draft"),
                    ]
                )
                .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
                .listRowSeparator(.hidden)
                .onChange(of: kind) { _, _ in
                    Task { await load() }
                }
            }

            if let errorMessage {
                TBInlineState(
                    kind: .error(errorMessage),
                    retryTitle: "Retry",
                    retry: { Task { await load() } }
                )
                .listRowSeparator(.hidden)
            }

            if items.isEmpty && !isLoading {
                TBInlineState(
                    kind: .empty(
                        icon: "calendar-solid",
                        title: kind == "draft" ? "No drafts yet" : "No scheduled posts",
                        message: nil
                    )
                )
                .listRowSeparator(.hidden)
            }

            ForEach(items) { item in
                ScheduledRow(item: item)
                    .swipeActions(edge: .trailing) {
                        Button(role: .destructive) {
                            Task { await delete(item) }
                        } label: { Label("Delete", hero: "trash-solid") }
                        Button {
                            Task { await publish(item) }
                        } label: { Label("Publish", hero: "paper-airplane-solid") }
                            .tint(TBColor.success)
                    }
                    .onTapGesture {
                        editing = item
                    }
            }
        }
        .tbListChrome()
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
            errorMessage = nil
        } catch {
            errorMessage = "Could not load scheduled posts."
        }
    }

    private func delete(_ item: ScheduledPost) async {
        do {
            try await env.api.sendVoid(API.ScheduledPosts.delete(item.id))
            items.removeAll { $0.id == item.id }
            env.toast.show("Scheduled post deleted")
        } catch {
            env.toast.show("Could not delete scheduled post", kind: .error)
        }
    }

    private func publish(_ item: ScheduledPost) async {
        do {
            try await env.api.sendVoid(API.ScheduledPosts.publish(item.id))
            items.removeAll { $0.id == item.id }
            env.toast.show("Post published")
        } catch {
            env.toast.show("Could not publish post", kind: .error)
        }
    }
}

private struct ScheduledRow: View {
    let item: ScheduledPost

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(item.text)
                .lineLimit(3)
                .font(TBTypography.bodySecondary)
                .foregroundStyle(TBColor.textPrimary)
            HStack {
                if let date = item.scheduledAt {
                    Label(
                        date.formatted(date: .abbreviated, time: .shortened),
                        hero: "calendar-solid"
                    )
                }
                Spacer()
                Text(item.kind)
                    .font(TBTypography.caption)
                    .padding(.horizontal, 6).padding(.vertical, 2)
                    .foregroundStyle(TBColor.textSecondary)
                    .tbGlassCapsule(.card, shadow: false)
            }
            .font(TBTypography.caption)
            .foregroundStyle(TBColor.textSecondary)
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
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    Text("Content")
                        .font(TBTypography.label)
                        .foregroundStyle(TBColor.textSecondary)
                    ZStack(alignment: .topLeading) {
                        TextEditor(text: $text)
                            .font(TBTypography.body)
                            .foregroundStyle(TBColor.textPrimary)
                            .scrollContentBackground(.hidden)
                            .padding(10)
                            .frame(minHeight: 120)
                    }
                    .tbGlass(
                        .field,
                        in: RoundedRectangle(cornerRadius: TBLayout.radiusGlassCard, style: .continuous),
                        interactive: true,
                        shadow: false
                    )

                    Text("When")
                        .font(TBTypography.label)
                        .foregroundStyle(TBColor.textSecondary)
                    DatePicker(
                        "Schedule",
                        selection: $scheduledAt,
                        in: Date()...,
                        displayedComponents: [.date, .hourAndMinute]
                    )
                    .tint(TBColor.accent)

                    if let errorMessage {
                        Text(errorMessage)
                            .font(TBTypography.meta)
                            .foregroundStyle(TBColor.danger)
                    }
                }
                .padding(TBLayout.pagePadding)
            }
            .background(Color.clear)
            .navigationTitle("Edit scheduled")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .foregroundStyle(TBColor.textSecondary)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { Task { await save() } }
                        .fontWeight(.semibold)
                        .foregroundStyle(TBColor.accent)
                        .disabled(isSaving || text.isEmpty)
                }
                ToolbarItem(placement: .destructiveAction) {
                    Button("Publish now") { Task { await publish() } }
                        .foregroundStyle(TBColor.success)
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
            env.toast.show("Scheduled post updated")
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
            env.toast.show("Post published")
            onChange()
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

#if DEBUG
#Preview("Light") {
    NavigationStack {
        ScheduledPostsView()
    }
    .tbPreview(authState: .signedIn(user: .preview), colorScheme: .light)
}

#Preview("Dark") {
    NavigationStack {
        ScheduledPostsView()
    }
    .tbPreview(authState: .signedIn(user: .preview), colorScheme: .dark)
}
#endif
