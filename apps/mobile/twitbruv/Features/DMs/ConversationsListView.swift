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
                        if vm.conversations.isEmpty && vm.didLoadOnce {
                            EmptyStateView(
                                icon: "envelope",
                                title: vm.folder == "requests"
                                    ? "No pending requests"
                                    : "No conversations yet"
                            )
                            .listRowSeparator(.hidden)
                        }
                        ForEach(vm.conversations) { conv in
                            Button {
                                path.append(DMRoute.conversation(id: conv.id))
                            } label: {
                                ConversationRow(conv: conv)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .listStyle(.plain)
                    .scrollContentBackground(.hidden)
                    .background(Color.clear)
                    .refreshable { await vm.reload() }
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
                                Image(systemName: "square.and.pencil")
                                    .foregroundStyle(TBColor.accent)
                            }
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
            .toolbar(path.isEmpty ? .hidden : .automatic, for: .navigationBar)
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
                case .invite(let token): InviteAcceptView(token: token)
                }
            }
            .task {
                if vm == nil {
                    let new = ConversationsListViewModel(api: env.api)
                    vm = new
                    await new.reload()
                }
            }
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
        if let m = conv.members?.first {
            return m.displayName ?? m.handle ?? "Conversation"
        }
        return "Conversation"
    }

    private var avatarURL: String? {
        conv.avatarUrl ?? conv.members?.first?.avatarUrl
    }

    var body: some View {
        HStack(spacing: 12) {
            AvatarView(urlString: avatarURL, size: 44, fallbackInitial: displayName)
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
