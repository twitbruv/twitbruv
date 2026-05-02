import SwiftUI
import Observation
import os

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
        } catch {}
    }

    func send(text: String, mediaId: String?) async {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty || mediaId != nil else { return }
        do {
            let response: SentMessageResponse = try await api.send(
                API.DMs.sendMessage(conversationId),
                body: SendMessageBody(text: trimmed, mediaId: mediaId, replyToId: nil)
            )
            if !messages.contains(where: { $0.id == response.message.id }) {
                messages.append(response.message)
            }
        } catch {}
    }

    func toggleReaction(_ emoji: String, on messageId: String) async {
        struct Body: Encodable { let emoji: String }
        do {
            try await api.sendVoid(
                API.DMs.toggleReaction(conversationId, msgId: messageId),
                body: Body(emoji: emoji)
            )
        } catch {}
    }

    func deleteMessage(_ messageId: String) async {
        do {
            try await api.sendVoid(API.DMs.deleteMessage(conversationId, msgId: messageId))
            messages.removeAll { $0.id == messageId }
        } catch {}
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

struct ConversationView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(AuthStore.self) private var auth
    let conversationId: String

    @State private var vm: ConversationViewModel?
    @State private var draft: String = ""
    @State private var showSettings = false
    @State private var reactionTarget: Message?

    var body: some View {
        VStack(spacing: 0) {
            messagesList
            DMComposeBar(
                text: $draft,
                onSend: { Task { await vm?.send(text: draft, mediaId: nil); draft = "" } },
                onTyping: { vm?.sendTyping() }
            )
        }
        .navigationTitle(vm?.conversation?.name ?? "Direct message")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    showSettings = true
                } label: {
                    Image(systemName: "info.circle")
                }
            }
        }
        .sheet(isPresented: $showSettings) {
            if let conv = vm?.conversation {
                GroupSettingsView(conversation: conv)
            }
        }
        .task {
            if vm == nil {
                let new = ConversationViewModel(conversationId: conversationId, api: env.api)
                vm = new
                await new.load()
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
                List {
                    if vm.nextCursor != nil {
                        Button("Load older") {
                            Task { await vm.loadOlder() }
                        }
                        .listRowSeparator(.hidden)
                    }
                    ForEach(vm.messages) { msg in
                        MessageBubble(
                            message: msg,
                            isMine: msg.senderId == auth.currentUser?.id
                        )
                        .listRowInsets(EdgeInsets(top: 4, leading: 12, bottom: 4, trailing: 12))
                        .listRowSeparator(.hidden)
                        .contextMenu {
                            Button {
                                reactionTarget = msg
                            } label: {
                                Label("React", systemImage: "face.smiling")
                            }
                            if msg.senderId == env.auth.currentUser?.id {
                                Button(role: .destructive) {
                                    Task { await vm.deleteMessage(msg.id) }
                                } label: {
                                    Label("Delete", systemImage: "trash")
                                }
                            }
                        }
                        .id(msg.id)
                    }
                    if !vm.typing.isEmpty {
                        Text("typing…")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .listRowSeparator(.hidden)
                    }
                }
                .listStyle(.plain)
                .onChange(of: vm.messages.count) { _, _ in
                    if let last = vm.messages.last?.id {
                        withAnimation {
                            proxy.scrollTo(last, anchor: .bottom)
                        }
                    }
                }
                .sheet(item: $reactionTarget) { target in
                    ReactionPicker { emoji in
                        Task { await vm.toggleReaction(emoji, on: target.id) }
                        reactionTarget = nil
                    }
                }
            }
        } else {
            ProgressView().frame(maxHeight: .infinity)
        }
    }
}

private struct MessageBubble: View {
    let message: Message
    let isMine: Bool

    var body: some View {
        HStack {
            if isMine { Spacer(minLength: 60) }
            VStack(alignment: isMine ? .trailing : .leading, spacing: 4) {
                if let text = message.text, !text.isEmpty {
                    Text(text)
                        .padding(10)
                        .background(
                            isMine ? Color.accentColor : Color(.tertiarySystemFill),
                            in: .rect(cornerRadius: 14)
                        )
                        .foregroundStyle(isMine ? .white : .primary)
                }
                if let media = message.media, let url = media.bestURL {
                    AsyncImage(url: url) { phase in
                        switch phase {
                        case .success(let img):
                            img.resizable().scaledToFit()
                        default:
                            Color(.tertiarySystemFill)
                        }
                    }
                    .frame(maxWidth: 240, maxHeight: 240)
                    .clipShape(.rect(cornerRadius: 14))
                }
                if let reactions = message.reactions, !reactions.isEmpty {
                    HStack(spacing: 4) {
                        ForEach(reactions, id: \.emoji) { r in
                            Text("\(r.emoji) \(r.count)")
                                .font(.caption)
                                .padding(.horizontal, 6).padding(.vertical, 2)
                                .background(.thinMaterial, in: .capsule)
                        }
                    }
                }
                Text(message.createdAt.relativeShort)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            if !isMine { Spacer(minLength: 60) }
        }
    }
}

struct DMComposeBar: View {
    @Binding var text: String
    var onSend: () -> Void
    var onTyping: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            TextField("Message", text: $text, axis: .vertical)
                .lineLimit(1...5)
                .padding(8)
                .background(Color(.secondarySystemBackground), in: .rect(cornerRadius: 18))
                .onChange(of: text) { _, _ in onTyping() }
            Button {
                onSend()
            } label: {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.title)
            }
            .disabled(text.trimmingCharacters(in: .whitespaces).isEmpty)
        }
        .padding(.horizontal)
        .padding(.vertical, 8)
        .background(.bar)
    }
}

private struct ReactionPicker: View {
    @Environment(\.dismiss) private var dismiss
    var onPick: (String) -> Void
    private let emojis = ["👍", "❤️", "😂", "😮", "😢", "🙏", "🔥", "🎉"]

    var body: some View {
        VStack {
            Text("Pick a reaction").font(.headline).padding(.top)
            HStack(spacing: 16) {
                ForEach(emojis, id: \.self) { e in
                    Button {
                        onPick(e)
                        dismiss()
                    } label: {
                        Text(e).font(.system(size: 36))
                    }
                }
            }
            .padding()
        }
        .presentationDetents([.height(160)])
    }
}
