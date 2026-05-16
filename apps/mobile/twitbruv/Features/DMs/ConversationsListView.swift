import SwiftUI
import Observation

@Observable
@MainActor
final class ConversationsListViewModel {
    let api: APIClient
    var folder: String = "inbox"
    var conversations: [Conversation] = []
    var requestCount: Int = 0
    var isLoading = false
    var error: APIError?
    var didLoadOnce = false

    init(api: APIClient) { self.api = api }

    func reload() async {
        isLoading = true
        defer { isLoading = false }
        do {
            let response: ConversationsResponse = try await api.get(
                API.DMs.conversations(folder: folder)
            )
            conversations = response.conversations
            requestCount = response.requestCount ?? 0
            didLoadOnce = true
            error = nil
        } catch let e as APIError {
            self.error = e
        } catch {
            self.error = .invalidResponse
        }
    }

    func accept(_ conversation: Conversation) async {
        do {
            try await api.sendVoid(API.DMs.accept(conversation.id))
            conversations.removeAll { $0.id == conversation.id }
            requestCount = max(0, requestCount - 1)
        } catch let e as APIError {
            self.error = e
        } catch {
            self.error = .invalidResponse
        }
    }

    func decline(_ conversation: Conversation) async {
        do {
            try await api.sendVoid(API.DMs.decline(conversation.id))
            conversations.removeAll { $0.id == conversation.id }
            requestCount = max(0, requestCount - 1)
        } catch let e as APIError {
            self.error = e
        } catch {
            self.error = .invalidResponse
        }
    }
}

struct ConversationsListView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var vm: ConversationsListViewModel?
    @State private var path = NavigationPath()
    @State private var showNew = false

    var body: some View {
        NavigationStack(path: $path) {
            Group {
                if let vm {
                    List {
                        if let err = vm.error, vm.conversations.isEmpty {
                            Section {
                                ErrorBanner(message: err.localizedDescription) {
                                    Task {
                                        await vm.reload()
                                        await env.badges.refreshDMs()
                                    }
                                }
                                .listRowSeparator(.hidden)
                            }
                        }
                        if vm.conversations.isEmpty && vm.didLoadOnce {
                            TBInlineState(
                                kind: .empty(
                                    icon: "envelope-solid",
                                    title: vm.folder == "requests"
                                        ? "No pending requests"
                                        : "No conversations yet",
                                    message: nil
                                )
                            )
                            .listRowSeparator(.hidden)
                        }
                        ForEach(vm.conversations) { conv in
                            VStack(alignment: .leading, spacing: 8) {
                                TappableRow(action: {
                                    path.append(DMRoute.conversation(id: conv.id))
                                }) {
                                    ConversationRow(conv: conv)
                                }
                                if vm.folder == "requests" {
                                    HStack(spacing: 10) {
                                        TBButton(title: "Accept", style: .primary, expands: false) {
                                            Task {
                                                await vm.accept(conv)
                                                await env.badges.refreshDMs()
                                                env.toast.show("Message request accepted")
                                            }
                                        }
                                        TBButton(title: "Decline", style: .secondary, expands: false) {
                                            Task {
                                                await vm.decline(conv)
                                                await env.badges.refreshDMs()
                                                env.toast.show("Message request declined")
                                            }
                                        }
                                    }
                                    .padding(.horizontal, TBLayout.pagePadding)
                                    .padding(.bottom, 8)
                                }
                            }
                            .listRowInsets(EdgeInsets())
                            .listRowSeparator(.hidden)
                            .listRowBackground(Color.clear)
                        }
                    }
                    .tbListChrome()
                    .refreshable {
                        await vm.reload()
                        await env.badges.refreshDMs()
                    }
                    .safeAreaInset(edge: .top, spacing: 0) {
                        HStack(alignment: .center, spacing: 10) {
                            TBFeedSegmented(
                                selection: Binding(
                                    get: { vm.folder },
                                    set: { new in
                                        vm.folder = new
                                        Task { await vm.reload() }
                                    }
                                ),
                                options: [
                                    ("Inbox", "inbox"),
                                    ("Requests (\(vm.requestCount))", "requests"),
                                ]
                            )
                            .padding(.leading, TBLayout.glassBarOuterMargin)
                            Spacer(minLength: 8)
                            Button {
                                showNew = true
                            } label: {
                                HeroIcon(name: "pencil-square-solid", size: 16)
                                    .foregroundStyle(TBColor.accent)
                                    .frame(width: 36, height: 36)
                                    .tbGlass(
                                        .chrome,
                                        in: Circle(),
                                        interactive: true,
                                        shadow: false
                                    )
                            }
                            .buttonStyle(TBSquishButtonStyle())
                            .accessibilityLabel("New conversation")
                            .padding(.trailing, TBLayout.glassBarOuterMargin)
                        }
                        .padding(.top, 6)
                        .padding(.bottom, 6)
                    }
                } else {
                    ProgressView()
                        .tint(TBColor.accent)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .background(Color.clear)
                }
            }
            .toolbarVisibility(.hidden, for: .navigationBar)
            .sheet(isPresented: $showNew) {
                NewConversationView { conv in
                    showNew = false
                    if let conv {
                        Task { await vm?.reload() }
                        path.append(DMRoute.conversation(id: conv.id))
                    }
                }
            }
            .navigationDestination(for: DMRoute.self) { route in
                switch route {
                case .conversation(let id): ConversationView(conversationId: id)
                case .invite(let token):
                    InviteAcceptView(token: token)
                        .toolbarVisibility(.visible, for: .navigationBar)
                }
            }
            .task {
                if vm == nil {
                    let new = ConversationsListViewModel(api: env.api)
                    vm = new
                    await new.reload()
                    await env.badges.refreshDMs()
                }
            }
            .onAppear { flushDeepLinks() }
            .onChange(of: env.deepLinks.dmRevision) { _, _ in flushDeepLinks() }
        }
    }

    private func flushDeepLinks() {
        for route in env.deepLinks.takePendingDMRoutes() {
            path.append(route)
        }
    }
}

enum DMRoute: Hashable {
    case conversation(id: String)
    case invite(token: String)
}

private struct ConversationRow: View {
    let conv: Conversation

    private var displayName: String {
        if let name = conv.name, !name.isEmpty { return name }
        if conv.isGroup, let members = conv.members, !members.isEmpty {
            // Comma-joined member names if no group title set
            let parts = members.prefix(3).map { $0.displayName ?? $0.handle ?? "—" }
            return parts.joined(separator: ", ")
        }
        if let m = conv.members?.first {
            return m.displayName ?? m.handle ?? "Conversation"
        }
        return "Conversation"
    }

    var body: some View {
        HStack(spacing: 12) {
            ConversationAvatar(conversation: conv, size: 44)
            VStack(alignment: .leading, spacing: 2) {
                HStack {
                    Text(displayName)
                        .font(TBTypography.meta.weight(.semibold))
                        .foregroundStyle(TBColor.textPrimary)
                    Spacer()
                    if let date = conv.lastMessageAt {
                        Text(date.relativeShort)
                            .font(TBTypography.caption)
                            .foregroundStyle(TBColor.textSecondary)
                    }
                }
                if let last = conv.lastMessage?.text {
                    Text(last)
                        .font(TBTypography.caption)
                        .foregroundStyle(TBColor.textSecondary)
                        .lineLimit(2)
                }
                if (conv.unreadCount ?? 0) > 0 {
                    Text("\(conv.unreadCount ?? 0) unread")
                        .font(TBTypography.micro)
                        .foregroundStyle(TBColor.accent)
                }
            }
        }
        .padding(.vertical, 6)
    }
}

#if DEBUG
#Preview("Light") {
    ConversationsListView()
        .tbPreview(authState: .signedIn(user: .preview), colorScheme: .light)
}

#Preview("Dark") {
    ConversationsListView()
        .tbPreview(authState: .signedIn(user: .preview), colorScheme: .dark)
}
#endif
