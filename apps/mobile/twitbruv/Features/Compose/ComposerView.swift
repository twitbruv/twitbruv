import Foundation
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
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    if case .reply(let parent) = mode {
                        composerSection(title: "Replying to") {
                            Text(parent.text)
                                .font(TBTypography.bodySecondary)
                                .foregroundStyle(TBColor.textSecondary)
                                .lineLimit(3)
                        }
                    }
                    if case .quote(let target) = mode {
                        composerSection(title: "Quoting") {
                            Text(target.text)
                                .font(TBTypography.bodySecondary)
                                .foregroundStyle(TBColor.textSecondary)
                                .lineLimit(3)
                        }
                    }

                    composerSection(title: nil) {
                        ZStack(alignment: .topLeading) {
                            RoundedRectangle(cornerRadius: TBLayout.radiusMD, style: .continuous)
                                .fill(TBColor.base2)
                            RoundedRectangle(cornerRadius: TBLayout.radiusMD, style: .continuous)
                                .strokeBorder(TBColor.borderNeutral, lineWidth: 0.5)
                            TextEditor(text: $text)
                                .font(TBTypography.body)
                                .foregroundStyle(TBColor.textPrimary)
                                .scrollContentBackground(.hidden)
                                .padding(10)
                                .frame(minHeight: 120)
                        }
                        HStack {
                            Spacer()
                            Text("\(text.count)/\(textLimit)")
                                .font(TBTypography.caption.monospacedDigit())
                                .foregroundStyle(
                                    text.count > textLimit
                                        ? TBColor.danger
                                        : TBColor.textSecondary
                                )
                        }
                    }

                    composerSection(title: "Media") {
                        PhotosPicker(
                            selection: $pickerItems,
                            maxSelectionCount: 4,
                            matching: .images
                        ) {
                            Label("Add photos", systemImage: "photo.on.rectangle")
                                .font(TBTypography.meta.weight(.medium))
                                .foregroundStyle(TBColor.textPrimary)
                        }
                        .tint(TBColor.accent)
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
                                                .clipShape(RoundedRectangle(cornerRadius: TBLayout.radiusMD, style: .continuous))
                                                .overlay(alignment: .topTrailing) {
                                                    Button {
                                                        picker.remove(id: p.id)
                                                    } label: {
                                                        Image(systemName: "xmark.circle.fill")
                                                            .foregroundStyle(
                                                                TBColor.textOnInverse,
                                                                TBColor.inverse
                                                            )
                                                    }
                                                    .padding(2)
                                                }
                                        }
                                    }
                                }
                            }
                        }
                    }

                    composerSection(title: "Poll") {
                        Toggle("Add a poll", isOn: Binding(
                            get: { pollOptions != nil },
                            set: { on in
                                if on, pollOptions == nil { pollOptions = ["", ""] }
                                if !on { pollOptions = nil }
                            }
                        ))
                        .tint(TBColor.inverse)

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

                    composerSection(title: "Settings") {
                        Picker("Visibility", selection: $visibility) {
                            Text("Public").tag("public")
                            Text("Followers").tag("followers")
                            Text("Unlisted").tag("unlisted")
                        }
                        .tint(TBColor.accent)
                        Toggle("Mark sensitive", isOn: $sensitive)
                            .tint(TBColor.inverse)
                        if sensitive {
                            ZStack(alignment: .leading) {
                                RoundedRectangle(cornerRadius: TBLayout.radiusMD, style: .continuous)
                                    .fill(TBColor.base2)
                                RoundedRectangle(cornerRadius: TBLayout.radiusMD, style: .continuous)
                                    .strokeBorder(TBColor.borderNeutral, lineWidth: 0.5)
                                TextField("Content warning", text: $contentWarning)
                                    .padding(.horizontal, 12)
                                    .padding(.vertical, 10)
                            }
                            .frame(minHeight: 40)
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
                        .tint(TBColor.accent)
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
                        .tint(TBColor.inverse)
                    }

                    if let card = unfurlPreview {
                        composerSection(title: "Link preview") {
                            VStack(alignment: .leading, spacing: 4) {
                                if let title = card.title {
                                    Text(title)
                                        .font(TBTypography.bodySecondary.weight(.semibold))
                                        .foregroundStyle(TBColor.textPrimary)
                                }
                                if let desc = card.description {
                                    Text(desc)
                                        .font(TBTypography.caption)
                                        .foregroundStyle(TBColor.textSecondary)
                                }
                            }
                        }
                    }

                    if let errorMessage {
                        Text(errorMessage)
                            .font(TBTypography.meta)
                            .foregroundStyle(TBColor.danger)
                    }
                }
                .padding(TBLayout.pagePadding)
            }
            .background(TBColor.base1)
            .navigationTitle(navigationTitle)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .foregroundStyle(TBColor.textSecondary)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(scheduledAt == nil ? "Post" : "Schedule") {
                        Task { await submit() }
                    }
                    .fontWeight(.semibold)
                    .foregroundStyle(TBColor.accent)
                    .disabled(!canSubmit || isSubmitting)
                }
            }
            .onChange(of: text) { _, new in
                Task { await previewIfPossible(text: new) }
            }
            .overlay {
                if isSubmitting {
                    ZStack {
                        TBColor.base1.opacity(0.72)
                        VStack(spacing: 12) {
                            ProgressView()
                                .tint(TBColor.accent)
                            Text("Posting…")
                                .font(TBTypography.meta.weight(.medium))
                                .foregroundStyle(TBColor.textPrimary)
                        }
                        .padding(24)
                        .background(TBColor.base2, in: RoundedRectangle(cornerRadius: TBLayout.radiusLG, style: .continuous))
                        .overlay {
                            RoundedRectangle(cornerRadius: TBLayout.radiusLG, style: .continuous)
                                .strokeBorder(TBColor.borderNeutral, lineWidth: 0.5)
                        }
                    }
                }
            }
        }
    }

    private func composerSection<Content: View>(
        title: String?,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            if let title {
                Text(title)
                    .font(TBTypography.label)
                    .foregroundStyle(TBColor.textSecondary)
            }
            content()
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
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: TBLayout.radiusMD, style: .continuous)
                        .fill(TBColor.base2)
                    RoundedRectangle(cornerRadius: TBLayout.radiusMD, style: .continuous)
                        .strokeBorder(TBColor.borderNeutral, lineWidth: 0.5)
                    TextField("Option \(idx + 1)", text: Binding(
                        get: { options[idx] },
                        set: { options[idx] = $0 }
                    ))
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                }
                if options.count > 2 {
                    Button {
                        options.remove(at: idx)
                    } label: {
                        Image(systemName: "minus.circle.fill")
                            .foregroundStyle(TBColor.danger)
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
                    .font(TBTypography.meta.weight(.medium))
                    .foregroundStyle(TBColor.accent)
            }
            .buttonStyle(.plain)
        }

        Picker("Duration", selection: $durationSec) {
            Text("1 hour").tag(3600)
            Text("6 hours").tag(21_600)
            Text("1 day").tag(86_400)
            Text("3 days").tag(259_200)
            Text("7 days").tag(604_800)
        }
        .tint(TBColor.accent)
        Toggle("Allow multiple choices", isOn: $allowMultiple)
            .tint(TBColor.inverse)
    }
}
