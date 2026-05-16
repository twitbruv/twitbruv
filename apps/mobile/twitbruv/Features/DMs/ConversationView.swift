import SwiftUI
import Observation
import os
import PhotosUI

@Observable
@MainActor
final class ConversationViewModel {
    let conversationId: String
    let api: APIClient
    var conversation: Conversation?
    var messages: [Message] = []
    var nextCursor: String?
    var isLoading = false
    var error: APIError?
    var typing: Set<String> = []
    var sendErrorMessage: String?
    private let log = Logger(subsystem: "app.twitbruv.ios", category: "dm-vm")
    private var sseTask: Task<Void, Never>?

    init(conversationId: String, api: APIClient) {
        self.conversationId = conversationId
        self.api = api
    }

    func load() async {
        do {
            let detail: ConversationDetailResponse = try await api.get(
                API.DMs.get(conversationId)
            )
            conversation = detail.conversation
            let messagesResp: MessagesResponse = try await api.get(
                API.DMs.messages(conversationId, cursor: nil)
            )
            messages = messagesResp.messages.reversed()
            nextCursor = messagesResp.nextCursor
            try? await api.sendVoid(API.DMs.read(conversationId))
            error = nil
        } catch let e as APIError {
            self.error = e
        } catch {
            self.error = .invalidResponse
        }
    }

    func loadOlder() async {
        guard let cursor = nextCursor, !isLoading else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            let response: MessagesResponse = try await api.get(
                API.DMs.messages(conversationId, cursor: cursor)
            )
            let older = response.messages.reversed()
            messages.insert(contentsOf: older, at: 0)
            nextCursor = response.nextCursor
        } catch let e as APIError {
            self.error = e
        } catch {
            self.error = .invalidResponse
        }
    }

    func send(text: String, mediaId: String?) async -> Bool {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty || mediaId != nil else { return false }
        do {
            let response: SentMessageResponse = try await api.send(
                API.DMs.sendMessage(conversationId),
                body: SendMessageBody(text: trimmed, mediaId: mediaId, replyToId: nil)
            )
            if !messages.contains(where: { $0.id == response.message.id }) {
                messages.append(response.message)
            }
            sendErrorMessage = nil
            return true
        } catch {
            sendErrorMessage = "Message could not be sent."
            return false
        }
    }

    func toggleReaction(_ emoji: String, on messageId: String) async {
        struct Body: Encodable { let emoji: String }
        if let idx = messages.firstIndex(where: { $0.id == messageId }) {
            var reactions = messages[idx].reactions ?? []
            if let reactionIdx = reactions.firstIndex(where: { $0.emoji == emoji }) {
                let wasMine = reactions[reactionIdx].byMe == true
                reactions[reactionIdx].byMe = !wasMine
                reactions[reactionIdx].count += wasMine ? -1 : 1
                if reactions[reactionIdx].count <= 0 {
                    reactions.remove(at: reactionIdx)
                }
            } else {
                reactions.append(Message.Reaction(emoji: emoji, count: 1, byMe: true))
            }
            messages[idx].reactions = reactions
        }
        do {
            try await api.sendVoid(
                API.DMs.toggleReaction(conversationId, msgId: messageId),
                body: Body(emoji: emoji)
            )
        } catch {
            await load()
        }
    }

    func deleteMessage(_ messageId: String) async -> Bool {
        do {
            try await api.sendVoid(API.DMs.deleteMessage(conversationId, msgId: messageId))
            messages.removeAll { $0.id == messageId }
            return true
        } catch {
            return false
        }
    }

    func sendTyping() {
        Task {
            try? await api.sendVoid(API.DMs.typing(conversationId))
        }
    }

    func startStream() {
        sseTask?.cancel()
        do {
            let endpoint = API.DMs.stream()
            let request = try api.makeRequest(endpoint, accept: "text/event-stream")
            let client = SSEClient(session: api.underlyingSession(), request: request)
            sseTask = Task { @MainActor in
                for await event in await client.events() {
                    self.ingest(event: event)
                }
            }
        } catch {
            log.warning("startStream error \(String(describing: error))")
        }
    }

    func stopStream() {
        sseTask?.cancel()
        sseTask = nil
    }

    private func ingest(event: SSEEvent) {
        guard let data = event.data.data(using: .utf8) else { return }
        do {
            let parsed = try JSONCoders.decoder.decode(DMStreamEvent.self, from: data)
            guard parsed.conversationId == conversationId else { return }
            switch parsed.type {
            case "message":
                if let msg = parsed.message,
                   !messages.contains(where: { $0.id == msg.id })
                {
                    messages.append(msg)
                    Task { try? await api.sendVoid(API.DMs.read(conversationId)) }
                    Task { @MainActor in
                        NotificationCenter.default.post(name: .dmUnreadCountShouldRefresh, object: nil)
                    }
                }
            case "message_deleted":
                if let id = parsed.messageId {
                    messages.removeAll { $0.id == id }
                }
            case "typing":
                if let userId = parsed.userId {
                    typing.insert(userId)
                    Task { @MainActor in
                        try? await Task.sleep(for: .seconds(4))
                        typing.remove(userId)
                    }
                }
            default:
                break
            }
        } catch {
            log.warning("dm decode err \(String(describing: error))")
        }
    }
}

private struct DMScrollHeightKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = max(value, nextValue())
    }
}

struct ConversationView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(AuthStore.self) private var auth
    @Environment(\.dismiss) private var dismiss

    let conversationId: String

    @State private var vm: ConversationViewModel?
    @State private var draft: String = ""
    @State private var showSettings = false
    @State private var reactionTarget: Message?
    @State private var scrollHeight: CGFloat = 0
    @State private var picker = PhotoPickerController()
    @State private var pickerItems: [PhotosPickerItem] = []
    @State private var isSending = false
    @State private var mediaViewer: MediaViewerItem?

    private var conversationTitle: String {
        guard let conv = vm?.conversation else { return "Direct message" }
        if let name = conv.name, !name.isEmpty { return name }
        if conv.isGroup, let members = conv.members, !members.isEmpty {
            return members.prefix(3)
                .map { $0.displayName ?? $0.handle ?? "—" }
                .joined(separator: ", ")
        }
        if let m = conv.members?.first {
            return m.displayName ?? m.handle ?? "Direct message"
        }
        return "Direct message"
    }

    var body: some View {
        messagesList
            .safeAreaInset(edge: .top, spacing: 0) {
                ConversationThreadHeader(
                    title: conversationTitle,
                    onBack: { dismiss() },
                    onInfo: { showSettings = true }
                )
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                VStack(spacing: 0) {
                    if !picker.picked.isEmpty {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack {
                                ForEach(picker.picked) { p in
                                    if let img = UIImage(data: p.data) {
                                        Image(uiImage: img)
                                            .resizable()
                                            .scaledToFill()
                                            .frame(width: 72, height: 72)
                                            .clipShape(RoundedRectangle(cornerRadius: TBLayout.radiusMD, style: .continuous))
                                            .overlay(alignment: .topTrailing) {
                                                Button {
                                                    picker.remove(id: p.id)
                                                    pickerItems.removeAll { _ in true }
                                                } label: {
                                                    HeroIcon(name: "xcircle-solid", size: 22)
                                                        .foregroundStyle(TBColor.inverse)
                                                }
                                                .padding(2)
                                                .accessibilityLabel("Remove image")
                                            }
                                    }
                                }
                            }
                            .padding(.horizontal, TBLayout.pagePadding)
                            .padding(.top, 8)
                        }
                    }
                    DMComposeBar(
                        text: $draft,
                        pickerItems: $pickerItems,
                        onSend: {
                            Task {
                                isSending = true
                                defer { isSending = false }
                                var mediaId: String?
                                if let photo = picker.picked.first {
                                    let uploader = MediaUploader(api: env.api)
                                    if let media = try? await uploader.upload(data: photo.data, mimeType: photo.mime) {
                                        mediaId = media.id
                                    } else {
                                        env.toast.show("Image upload failed", kind: .error)
                                        return
                                    }
                                }
                                let sent = await vm?.send(text: draft, mediaId: mediaId) == true
                                if sent {
                                    draft = ""
                                    picker.clear()
                                    pickerItems = []
                                    await env.badges.refreshDMs()
                                } else {
                                    env.toast.show("Message could not be sent", kind: .error)
                                }
                            }
                        },
                        onTyping: { vm?.sendTyping() },
                        isSending: isSending
                    )
                    .onChange(of: pickerItems) { _, items in
                        Task { await picker.ingest(items) }
                    }
                }
            }
        .background(TBColor.base1.ignoresSafeArea())
        .toolbarVisibility(.hidden, for: .navigationBar)
        .toolbar(.hidden, for: .tabBar)
        .preference(key: MainChromePreference.HideComposeFab.self, value: true)
        .sheet(isPresented: $showSettings) {
            if let conv = vm?.conversation {
                GroupSettingsView(conversation: conv)
            }
        }
        .sheet(item: $mediaViewer) { item in
            MediaViewerView(media: item.media, initialID: item.initialID)
        }
        .task {
            if vm == nil {
                let new = ConversationViewModel(conversationId: conversationId, api: env.api)
                vm = new
                await new.load()
                await env.badges.refreshDMs()
                new.startStream()
            }
        }
        .onDisappear {
            vm?.stopStream()
        }
    }

    @ViewBuilder
    private var messagesList: some View {
        if let vm {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 10) {
                        if vm.nextCursor != nil {
                            HStack {
                                Spacer(minLength: 0)
                                Button {
                                    Task { await vm.loadOlder() }
                                } label: {
                                    HStack(spacing: 8) {
                                        if vm.isLoading {
                                            ProgressView()
                                                .tint(TBColor.accent)
                                                .scaleEffect(0.85)
                                        }
                                        Text("Earlier messages")
                                            .font(TBTypography.caption.weight(.medium))
                                            .foregroundStyle(TBColor.accent)
                                    }
                                    .padding(.horizontal, 12)
                                    .padding(.vertical, 6)
                                    .tbGlassCapsule(.card, shadow: false)
                                }
                                .buttonStyle(.plain)
                                .disabled(vm.isLoading)
                                Spacer(minLength: 0)
                            }
                            .padding(.bottom, 4)
                            .id("__load_older")
                        }

                        ForEach(Array(vm.messages.enumerated()), id: \.element.id) { index, msg in
                            let isLastForSender: Bool = {
                                if index == vm.messages.count - 1 { return true }
                                return vm.messages[index + 1].senderId != msg.senderId
                            }()
                            MessageBubble(
                                message: msg,
                                isMine: msg.senderId == auth.currentUser?.id,
                                showTimestamp: isLastForSender,
                                onTapMedia: { media in
                                    mediaViewer = MediaViewerItem(media: [media], initialID: media.id)
                                }
                            )
                            .padding(.horizontal, TBLayout.pagePadding - 4)
                            .contextMenu {
                                Button {
                                    reactionTarget = msg
                                } label: {
                                    Label("React", hero: "face-smile-solid")
                                }
                                if msg.senderId == env.auth.currentUser?.id {
                                    Button(role: .destructive) {
                                        Task {
                                            let ok = await vm.deleteMessage(msg.id)
                                            env.toast.show(
                                                ok ? "Message deleted" : "Could not delete message",
                                                kind: ok ? .success : .error
                                            )
                                        }
                                    } label: {
                                        Label("Delete", hero: "trash-solid")
                                    }
                                }
                            }
                            .id(msg.id)
                        }

                        if !vm.typing.isEmpty {
                            Text("Typing…")
                                .font(TBTypography.caption.weight(.medium))
                                .foregroundStyle(TBColor.textSecondary)
                                .padding(.horizontal, 14)
                                .padding(.vertical, 8)
                                .tbGlassCapsule(.card, shadow: false)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(.horizontal, TBLayout.pagePadding - 4)
                                .padding(.top, 4)
                        }
                    }
                    .frame(maxWidth: .infinity, minHeight: scrollHeight, alignment: .bottom)
                    .padding(.vertical, 10)
                }
                .background(
                    GeometryReader { geo in
                        Color.clear.preference(key: DMScrollHeightKey.self, value: geo.size.height)
                    }
                )
                .onPreferenceChange(DMScrollHeightKey.self) { height in
                    if abs(scrollHeight - height) > 1 {
                        scrollHeight = height
                    }
                }
                .scrollDismissesKeyboard(.interactively)
                .scrollIndicators(.hidden)
                .sheet(item: $reactionTarget) { target in
                    ReactionPicker { emoji in
                        Task { await vm.toggleReaction(emoji, on: target.id) }
                        reactionTarget = nil
                    }
                }
                .onChange(of: vm.messages.count) { _, _ in
                    guard let last = vm.messages.last?.id else { return }
                    withAnimation(.easeOut(duration: 0.22)) {
                        proxy.scrollTo(last, anchor: .bottom)
                    }
                }
                .onAppear {
                    if let last = vm.messages.last?.id {
                        DispatchQueue.main.async {
                            proxy.scrollTo(last, anchor: .bottom)
                        }
                    }
                }
            }
        } else {
            ProgressView()
                .tint(TBColor.accent)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color.clear)
        }
    }
}

extension Notification.Name {
    static let dmUnreadCountShouldRefresh = Notification.Name("twitbruv.dmUnreadCountShouldRefresh")
}

private struct ConversationThreadHeader: View {
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency

    let title: String
    let onBack: () -> Void
    let onInfo: () -> Void

    var body: some View {
        HStack(spacing: 6) {
            Button(action: onBack) {
                if reduceTransparency {
                    HeroIcon(name: "chevron-left-solid", size: 20)
                        .foregroundStyle(TBColor.textPrimary)
                        .frame(width: 44, height: 44)
                        .background(Circle().fill(TBColor.base2))
                        .overlay {
                            Circle().strokeBorder(TBColor.glassStroke, lineWidth: 0.6)
                        }
                } else {
                    HeroIcon(name: "chevron-left-solid", size: 20)
                        .foregroundStyle(TBColor.textPrimary)
                        .frame(width: 44, height: 44)
                        .background { Circle().fill(.clear) }
                        .glassEffect(Glass.clear.interactive(), in: Circle())
                }
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Back")

            Text(title)
                .font(TBTypography.cardTitle.weight(.semibold))
                .foregroundStyle(TBColor.textPrimary)
                .lineLimit(1)
                .frame(maxWidth: .infinity)

            Button(action: onInfo) {
                if reduceTransparency {
                    HeroIcon(name: "information-circle-solid", size: 20)
                        .foregroundStyle(TBColor.textPrimary)
                        .frame(width: 44, height: 44)
                        .background(Circle().fill(TBColor.base2))
                        .overlay {
                            Circle().strokeBorder(TBColor.glassStroke, lineWidth: 0.6)
                        }
                } else {
                    HeroIcon(name: "information-circle-solid", size: 20)
                        .foregroundStyle(TBColor.textPrimary)
                        .frame(width: 44, height: 44)
                        .background { Circle().fill(.clear) }
                        .glassEffect(Glass.clear.interactive(), in: Circle())
                }
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Conversation details")
        }
        .padding(.horizontal, TBLayout.pagePadding - 10)
        .padding(.vertical, 6)
        .background {
            if reduceTransparency {
                TBColor.base1
            } else {
                Color.clear
            }
        }
    }
}

private struct MessageBubble: View {
    let message: Message
    let isMine: Bool
    let showTimestamp: Bool
    var onTapMedia: ((Media) -> Void)?

    private let bubbleRadius: CGFloat = 20

    var body: some View {
        HStack(alignment: .bottom, spacing: 0) {
            if isMine { Spacer(minLength: 48) }
            VStack(alignment: isMine ? .trailing : .leading, spacing: 5) {
                if let text = message.text, !text.isEmpty {
                    Text(text)
                        .font(TBTypography.bodySecondary)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 11)
                        .background(
                            isMine ? Color.blue : TBColor.base2,
                            in: RoundedRectangle(cornerRadius: bubbleRadius, style: .continuous)
                        )
                        .foregroundStyle(
                            isMine ? .white : TBColor.textPrimary
                        )
                }
                if let media = message.media, let url = media.bestURL {
                    Button {
                        onTapMedia?(media)
                    } label: {
                        AsyncImage(url: url) { phase in
                            switch phase {
                            case .success(let img):
                                img.resizable().scaledToFit()
                            default:
                                TBColor.base2
                            }
                        }
                        .frame(maxWidth: 240, maxHeight: 240)
                        .clipShape(RoundedRectangle(cornerRadius: bubbleRadius, style: .continuous))
                    }
                    .buttonStyle(.plain)
                }
                if let reactions = message.reactions, !reactions.isEmpty {
                    HStack(spacing: 4) {
                        ForEach(reactions, id: \.emoji) { r in
                            Text("\(r.emoji) \(r.count)")
                                .font(TBTypography.caption)
                                .padding(.horizontal, 6).padding(.vertical, 2)
                                .tbGlassCapsule(.card, shadow: false)
                        }
                    }
                }
                if showTimestamp {
                    Text(message.createdAt.conversationTimeLabel)
                        .font(TBTypography.micro)
                        .foregroundStyle(TBColor.textTertiary)
                }
            }
            if !isMine { Spacer(minLength: 48) }
        }
    }
}

struct DMComposeBar: View {
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency

    @Binding var text: String
    @Binding var pickerItems: [PhotosPickerItem]
    var onSend: () -> Void
    var onTyping: () -> Void
    var isSending: Bool = false

    private let attachmentDiameter: CGFloat = 36
    private let sendDiameter: CGFloat = 28

    var body: some View {
        HStack(alignment: .bottom, spacing: 10) {
            PhotosPicker(
                selection: $pickerItems,
                maxSelectionCount: 1,
                matching: .images
            ) {
                HeroIcon(name: "plus-solid", size: 20)
                    .foregroundStyle(TBColor.textPrimary)
                    .frame(width: attachmentDiameter, height: attachmentDiameter)
            }
            .buttonStyle(.plain)
            .background {
                Group {
                    if reduceTransparency {
                        Circle()
                            .fill(TBColor.base2)
                            .overlay {
                                Circle().strokeBorder(TBColor.glassStroke, lineWidth: 0.6)
                            }
                    } else {
                        Circle().fill(.clear).glassEffect(
                            Glass.clear.interactive(),
                            in: Circle()
                        )
                    }
                }
                .allowsHitTesting(false)
            }
            .padding(.bottom, 2)

            HStack(alignment: .bottom, spacing: 4) {
                TextField("Message", text: $text, axis: .vertical)
                    .lineLimit(1...6)
                    .font(TBTypography.bodySecondary)
                    .foregroundStyle(TBColor.textPrimary)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .onChange(of: text) { _, _ in onTyping() }

                let canSend = (!text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !pickerItems.isEmpty) && !isSending
                Button {
                    if canSend { onSend() }
                } label: {
                    if isSending {
                        ProgressView()
                            .tint(.white)
                            .scaleEffect(0.6)
                            .frame(width: sendDiameter, height: sendDiameter)
                    } else {
                        HeroIcon(name: "arrow-up-circle-solid", size: 18)
                            .foregroundStyle(canSend ? .white : TBColor.textTertiary)
                            .frame(width: sendDiameter, height: sendDiameter)
                            .contentShape(Circle())
                    }
                }
                .buttonStyle(.plain)
                .disabled(!canSend)
                .background {
                    Circle()
                        .fill(canSend ? TBColor.success : TBColor.borderNeutral)
                }
                .padding(.trailing, 6)
                .padding(.bottom, 6)
            }
            .tbGlass(
                .field,
                in: RoundedRectangle(cornerRadius: 22, style: .continuous),
                interactive: true,
                shadow: false
            )
        }
        .padding(.horizontal, TBLayout.pagePadding)
        .padding(.vertical, 8)
        .background {
            if reduceTransparency {
                TBColor.base1
            } else {
                Color.clear
            }
        }
    }
}

private struct ReactionPicker: View {
    @Environment(\.dismiss) private var dismiss
    var onPick: (String) -> Void
    private let emojis = ["👍", "❤️", "😂", "😮", "😢", "🙏", "🔥", "🎉"]

    var body: some View {
        VStack(spacing: 12) {
            Text("Pick a reaction")
                .font(TBTypography.cardTitle)
                .foregroundStyle(TBColor.textPrimary)
                .padding(.top)
            HStack(spacing: 16) {
                ForEach(emojis, id: \.self) { e in
                    Button {
                        onPick(e)
                        dismiss()
                    } label: {
                        Text(e).font(.system(size: 36))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding()
        }
        .frame(maxWidth: .infinity)
        .background(.ultraThinMaterial)
        .presentationBackground(.ultraThinMaterial)
        .presentationDetents([.height(160)])
    }
}

#if DEBUG
#Preview("Light") {
    ConversationView(conversationId: PreviewConst.conversationId)
        .tbPreview(authState: .signedIn(user: .preview), colorScheme: .light)
}

#Preview("Dark") {
    ConversationView(conversationId: PreviewConst.conversationId)
        .tbPreview(authState: .signedIn(user: .preview), colorScheme: .dark)
}
#endif
