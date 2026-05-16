import SwiftUI
import Observation

@Observable
@MainActor
final class ThreadViewModel {
    let postId: String
    let api: APIClient
    var post: Post?
    var ancestors: [Post] = []
    var replies: [Post] = []
    var isLoading = false
    var error: APIError?

    init(postId: String, api: APIClient) {
        self.postId = postId
        self.api = api
    }

    func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            let response: ThreadResponse = try await api.get(API.Posts.thread(postId))
            self.post = response.post
            self.ancestors = response.ancestors ?? []
            self.replies = response.replies ?? []
            error = nil
        } catch let e as APIError {
            self.error = e
        } catch {
            self.error = .invalidResponse
        }
    }

    func apply(mutation: PostMutation, to id: String) {
        if id == post?.id, var p = post {
            mutation.apply(to: &p)
            post = p
        }
        if let idx = ancestors.firstIndex(where: { $0.id == id }) {
            mutation.apply(to: &ancestors[idx])
        }
        if let idx = replies.firstIndex(where: { $0.id == id }) {
            mutation.apply(to: &replies[idx])
        }
        if case .deleted = mutation {
            ancestors.removeAll { $0.id == id }
            replies.removeAll { $0.id == id }
        }
    }

    func applyPollMutation(_ mutation: PostMutation) {
        if var p = post {
            mutation.apply(to: &p)
            post = p
        }
        for idx in ancestors.indices {
            mutation.apply(to: &ancestors[idx])
        }
        for idx in replies.indices {
            mutation.apply(to: &replies[idx])
        }
    }
}

struct ThreadView: View {
    @Environment(AppEnvironment.self) private var env
    let postId: String

    @State private var vm: ThreadViewModel?
    @State private var actions: PostActions?
    @State private var composeMode: ComposeMode?
    @State private var reportTarget: Post?
    @State private var mediaViewer: MediaViewerItem?

    var body: some View {
        Group {
            if let vm {
                List {
                    ForEach(vm.ancestors) { ancestor in
                        PostCardView(
                            post: ancestor,
                            displayMode: .threadReply,
                            onLike: { Task { await actions?.toggleLike(ancestor) } },
                            onRepost: { Task { await actions?.toggleRepost(ancestor) } },
                            onQuote: { composeMode = .quote(ancestor) },
                            onBookmark: { Task { await actions?.toggleBookmark(ancestor) } },
                            onReply: { composeMode = .reply(ancestor) },
                            onTapAuthor: nil,
                            onTapMedia: { media, all in
                                mediaViewer = MediaViewerItem(media: all, initialID: media.id)
                            },
                            onVotePoll: { pollId, optionId in
                                Task {
                                    await actions?.votePoll(
                                        pollId: pollId,
                                        optionId: optionId,
                                        previousOptionIds: ancestor.poll?.viewerVoteOptionIds
                                    )
                                }
                            },
                            onMenuAction: nil
                        )
                        .listRowInsets(EdgeInsets())
                        .listRowSeparator(.hidden)
                        .listRowBackground(Color.clear)
                    }

                    if let p = vm.post {
                        PostCardView(
                            post: p,
                            displayMode: .threadRoot,
                            onLike: { Task { await actions?.toggleLike(p) } },
                            onRepost: { Task { await actions?.toggleRepost(p) } },
                            onQuote: { composeMode = .quote(p) },
                            onBookmark: { Task { await actions?.toggleBookmark(p) } },
                            onReply: { composeMode = .reply(p) },
                            onTapAuthor: nil,
                            onTapMedia: { media, all in
                                mediaViewer = MediaViewerItem(media: all, initialID: media.id)
                            },
                            onVotePoll: { pollId, optionId in
                                Task {
                                    await actions?.votePoll(
                                        pollId: pollId,
                                        optionId: optionId,
                                        previousOptionIds: p.poll?.viewerVoteOptionIds
                                    )
                                }
                            },
                            onMenuAction: { action in
                                if case .report = action { reportTarget = p }
                            }
                        )
                        .listRowInsets(EdgeInsets())
                        .listRowSeparator(.hidden)
                        .listRowBackground(Color.clear)

                        Section("\(vm.replies.count) replies") {
                            ForEach(vm.replies) { reply in
                                PostCardView(
                                    post: reply,
                                    displayMode: .threadReply,
                                    onLike: { Task { await actions?.toggleLike(reply) } },
                                    onRepost: { Task { await actions?.toggleRepost(reply) } },
                                    onQuote: { composeMode = .quote(reply) },
                                    onBookmark: { Task { await actions?.toggleBookmark(reply) } },
                                    onReply: { composeMode = .reply(reply) },
                                    onTapAuthor: nil,
                                    onTapMedia: { media, all in
                                        mediaViewer = MediaViewerItem(media: all, initialID: media.id)
                                    },
                                    onVotePoll: { pollId, optionId in
                                        Task {
                                            await actions?.votePoll(
                                                pollId: pollId,
                                                optionId: optionId,
                                                previousOptionIds: reply.poll?.viewerVoteOptionIds
                                            )
                                        }
                                    },
                                    onMenuAction: { action in
                                        if case .report = action { reportTarget = reply }
                                    }
                                )
                                .listRowInsets(EdgeInsets())
                                .listRowSeparator(.hidden)
                                .listRowBackground(Color.clear)
                            }
                        }
                    }
                }
                .tbListChrome()
                .refreshable { await vm.load() }
            } else {
                TBInlineState(kind: .loading("Loading thread"))
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Color.clear)
            }
        }
        .navigationTitle("Thread")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            if vm == nil { vm = ThreadViewModel(postId: postId, api: env.api) }
            if actions == nil { actions = PostActions(api: env.api) }
            await vm?.load()
        }
        .onReceive(
            NotificationCenter.default.publisher(for: .postMutated)
        ) { note in
            guard let box = note.userInfo?["mutation"] as? MutationBox else { return }
            if let id = note.userInfo?["id"] as? String {
                vm?.apply(mutation: box.mutation, to: id)
            } else if note.userInfo?["pollId"] is String {
                vm?.applyPollMutation(box.mutation)
            }
        }
        .sheet(
            isPresented: Binding(
                get: { composeMode != nil },
                set: { if !$0 { composeMode = nil } }
            )
        ) {
            ComposerView(mode: composeMode ?? .new)
        }
        .sheet(item: $reportTarget) { post in
            ReportSheet(subject: .post(id: post.id))
        }
        .sheet(item: $mediaViewer) { item in
            MediaViewerView(media: item.media, initialID: item.initialID)
        }
    }
}

#if DEBUG
#Preview("Light") {
    ThreadView(postId: PreviewConst.threadPostId)
        .tbPreview(authState: .signedIn(user: .preview), colorScheme: .light)
}

#Preview("Dark") {
    ThreadView(postId: PreviewConst.threadPostId)
        .tbPreview(authState: .signedIn(user: .preview), colorScheme: .dark)
}
#endif
