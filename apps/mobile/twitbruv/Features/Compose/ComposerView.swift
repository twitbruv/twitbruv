import PhotosUI
import SwiftUI

enum ComposeMode: Equatable {
    case new
    case reply(Post)
    case quote(Post)
    case scheduled(ScheduledPost)
}

struct ComposerView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss

    let mode: ComposeMode

    @State private var text: String = ""
    @State private var picker = PhotoPickerController()
    @State private var pickerItems: [PhotosPickerItem] = []
    @State private var pollOptions: [String]?
    @State private var pollDurationSec: Int = 86_400
    @State private var pollAllowMultiple = false
    @State private var visibility: String = "public"
    @State private var sensitive = false
    @State private var contentWarning: String = ""
    @State private var scheduledAt: Date?
    @State private var isSubmitting = false
    @State private var errorMessage: String?
    @State private var unfurlPreview: UnfurlCard?

    private let textLimit = 500

    var body: some View {
        NavigationStack {
            Form {
                if case .reply(let parent) = mode {
                    Section("Replying to") {
                        Text(parent.text).lineLimit(3).font(.callout)
                            .foregroundStyle(.secondary)
                    }
                }
                if case .quote(let target) = mode {
                    Section("Quoting") {
                        Text(target.text).lineLimit(3).font(.callout)
                            .foregroundStyle(.secondary)
                    }
                }

                Section {
                    TextEditor(text: $text)
                        .frame(minHeight: 120)
                    HStack {
                        Spacer()
                        Text("\(text.count)/\(textLimit)")
                            .font(.caption.monospacedDigit())
                            .foregroundStyle(text.count > textLimit ? .red : .secondary)
                    }
                }

                Section {
                    PhotosPicker(
                        selection: $pickerItems,
                        maxSelectionCount: 4,
                        matching: .images
                    ) {
                        Label("Add photos", systemImage: "photo.on.rectangle")
                    }
                    .onChange(of: pickerItems) { _, items in
                        Task { await picker.ingest(items) }
                    }
                    if !picker.picked.isEmpty {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack {
                                ForEach(picker.picked) { p in
                                    if let img = UIImage(data: p.data) {
                                        Image(uiImage: img)
                                            .resizable()
                                            .scaledToFill()
                                            .frame(width: 88, height: 88)
                                            .clipShape(.rect(cornerRadius: 8))
                                            .overlay(alignment: .topTrailing) {
                                                Button {
                                                    picker.remove(id: p.id)
                                                } label: {
                                                    Image(systemName: "xmark.circle.fill")
                                                        .foregroundStyle(.white, .black)
                                                }
                                                .padding(2)
                                            }
                                    }
                                }
                            }
                        }
                    }
                }

                Section {
                    Toggle("Add a poll", isOn: Binding(
                        get: { pollOptions != nil },
                        set: { on in
                            if on, pollOptions == nil { pollOptions = ["", ""] }
                            if !on { pollOptions = nil }
                        }
                    ))

                    if pollOptions != nil {
                        PollEditor(
                            options: Binding(
                                get: { pollOptions ?? [] },
                                set: { pollOptions = $0 }
                            ),
                            durationSec: $pollDurationSec,
                            allowMultiple: $pollAllowMultiple
                        )
                    }
                }

                Section("Settings") {
                    Picker("Visibility", selection: $visibility) {
                        Text("Public").tag("public")
                        Text("Followers").tag("followers")
                        Text("Unlisted").tag("unlisted")
                    }
                    Toggle("Mark sensitive", isOn: $sensitive)
                    if sensitive {
                        TextField("Content warning", text: $contentWarning)
                    }
                    DatePicker(
                        "Schedule",
                        selection: Binding(
                            get: { scheduledAt ?? .now.addingTimeInterval(3600) },
                            set: { scheduledAt = $0 }
                        ),
                        in: Date()...,
                        displayedComponents: [.date, .hourAndMinute]
                    )
                    .disabled(scheduledAt == nil)
                    Toggle(
                        "Schedule for later",
                        isOn: Binding(
                            get: { scheduledAt != nil },
                            set: { on in
                                scheduledAt = on ? .now.addingTimeInterval(3600) : nil
                            }
                        )
                    )
                }

                if let card = unfurlPreview {
                    Section("Link preview") {
                        VStack(alignment: .leading, spacing: 4) {
                            if let title = card.title {
                                Text(title).font(.callout.weight(.semibold))
                            }
                            if let desc = card.description {
                                Text(desc).font(.footnote).foregroundStyle(.secondary)
                            }
                        }
                    }
                }

                if let errorMessage {
                    Section {
                        Text(errorMessage).foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle(navigationTitle)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(scheduledAt == nil ? "Post" : "Schedule") {
                        Task { await submit() }
                    }
                    .disabled(!canSubmit || isSubmitting)
                }
            }
            .onChange(of: text) { _, new in
                Task { await previewIfPossible(text: new) }
            }
            .overlay {
                if isSubmitting {
                    ProgressView("Posting…")
                        .padding(20)
                        .background(.thinMaterial, in: .rect(cornerRadius: 12))
                }
            }
        }
    }

    private var navigationTitle: String {
        switch mode {
        case .new: return "New post"
        case .reply: return "Reply"
        case .quote: return "Quote"
        case .scheduled: return "Edit scheduled"
        }
    }

    private var canSubmit: Bool {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if !picker.picked.isEmpty { return true }
        if pollOptions != nil { return validPoll }
        return !trimmed.isEmpty && trimmed.count <= textLimit
    }

    private var validPoll: Bool {
        guard let opts = pollOptions else { return true }
        let cleaned = opts.map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
        return cleaned.count >= 2 && cleaned.count <= 4
    }

    private func previewIfPossible(text: String) async {
        guard let url = firstURL(in: text) else {
            unfurlPreview = nil
            return
        }
        do {
            let response: UnfurlPreviewResponse = try await env.api.get(
                API.Unfurl.preview(url.absoluteString)
            )
            if let card = response.card { unfurlPreview = card }
        } catch {
            unfurlPreview = nil
        }
    }

    private func firstURL(in text: String) -> URL? {
        let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue)
        let range = NSRange(text.startIndex..<text.endIndex, in: text)
        return detector?.firstMatch(in: text, options: [], range: range)?.url
    }

    private func submit() async {
        errorMessage = nil
        isSubmitting = true
        defer { isSubmitting = false }

        do {
            var mediaIds: [String] = []
            if !picker.picked.isEmpty {
                let uploader = MediaUploader(api: env.api)
                for p in picker.picked {
                    let media = try await uploader.upload(data: p.data, mimeType: p.mime)
                    mediaIds.append(media.id)
                }
            }

            let pollInput: CreatePostBody.PollInput? = {
                guard let opts = pollOptions else { return nil }
                let cleaned = opts.map { $0.trimmingCharacters(in: .whitespaces) }
                    .filter { !$0.isEmpty }
                return CreatePostBody.PollInput(
                    options: cleaned,
                    durationSeconds: pollDurationSec,
                    allowMultiple: pollAllowMultiple
                )
            }()

            if let scheduledAt {
                let body = ScheduledPostBody(
                    kind: "scheduled",
                    text: text,
                    mediaIds: mediaIds.isEmpty ? nil : mediaIds,
                    visibility: visibility,
                    sensitive: sensitive,
                    contentWarning: sensitive ? contentWarning : nil,
                    replyRestriction: "anyone",
                    scheduledAt: scheduledAt
                )
                let _: ScheduledPostResponse = try await env.api.send(
                    API.ScheduledPosts.create(), body: body
                )
                dismiss()
                return
            }

            var body = CreatePostBody(
                text: text,
                mediaIds: mediaIds.isEmpty ? nil : mediaIds,
                visibility: visibility,
                sensitive: sensitive,
                contentWarning: sensitive ? contentWarning : nil,
                replyRestriction: "anyone",
                poll: pollInput
            )
            switch mode {
            case .reply(let parent): body.replyToId = parent.id
            case .quote(let target): body.quoteOfId = target.id
            default: break
            }

            let response: SinglePostResponse = try await env.api.send(
                API.Posts.create(), body: body
            )
            NotificationCenter.default.post(
                name: .composedPostCreated, object: response.post
            )
            dismiss()
        } catch let APIError.http(_, _, message) {
            errorMessage = message ?? "Couldn't post."
        } catch let APIError.rateLimited(retry, _) {
            errorMessage = "Too many requests. Try in \(retry)s."
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

private struct PollEditor: View {
    @Binding var options: [String]
    @Binding var durationSec: Int
    @Binding var allowMultiple: Bool

    var body: some View {
        ForEach(options.indices, id: \.self) { idx in
            HStack {
                TextField("Option \(idx + 1)", text: Binding(
                    get: { options[idx] },
                    set: { options[idx] = $0 }
                ))
                if options.count > 2 {
                    Button {
                        options.remove(at: idx)
                    } label: {
                        Image(systemName: "minus.circle.fill")
                            .foregroundStyle(.red)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        if options.count < 4 {
            Button {
                options.append("")
            } label: {
                Label("Add option", systemImage: "plus")
            }
        }

        Picker("Duration", selection: $durationSec) {
            Text("1 hour").tag(3600)
            Text("6 hours").tag(21_600)
            Text("1 day").tag(86_400)
            Text("3 days").tag(259_200)
            Text("7 days").tag(604_800)
        }
        Toggle("Allow multiple choices", isOn: $allowMultiple)
    }
}
