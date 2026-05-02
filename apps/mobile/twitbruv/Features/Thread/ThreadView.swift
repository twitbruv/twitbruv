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
}

struct ThreadView: View {
    @Environment(AppEnvironment.self) private var env
    let postId: String

    @State private var vm: ThreadViewModel?
    @State private var actions: PostActions?
    @State private var showCompose = false
    @State private var reportTarget: Post?

    var body: some View {
        Group {
            if let vm {
                List {
                    ForEach(vm.ancestors) { ancestor in
                        PostCardView(
                            post: ancestor,
                            onLike: { Task { await actions?.toggleLike(ancestor) } },
                            onRepost: { Task { await actions?.toggleRepost(ancestor) } },
                            onBookmark: { Task { await actions?.toggleBookmark(ancestor) } },
                            onReply: nil,
                            onTapAuthor: nil,
                            onMenuAction: nil
                        )
                        .listRowInsets(EdgeInsets())
                    }

                    if let p = vm.post {
                        PostCardView(
                            post: p,
                            onLike: { Task { await actions?.toggleLike(p) } },
                            onRepost: { Task { await actions?.toggleRepost(p) } },
                            onBookmark: { Task { await actions?.toggleBookmark(p) } },
                            onReply: { showCompose = true },
                            onTapAuthor: nil,
                            onMenuAction: { action in
                                if case .report = action { reportTarget = p }
                            }
                        )
                        .listRowInsets(EdgeInsets())

                        Section("\(vm.replies.count) replies") {
                            ForEach(vm.replies) { reply in
                                PostCardView(
                                    post: reply,
                                    onLike: { Task { await actions?.toggleLike(reply) } },
                                    onRepost: { Task { await actions?.toggleRepost(reply) } },
                                    onBookmark: { Task { await actions?.toggleBookmark(reply) } },
                                    onReply: nil,
                                    onTapAuthor: nil,
                                    onMenuAction: { action in
                                        if case .report = action { reportTarget = reply }
                                    }
                                )
                                .listRowInsets(EdgeInsets())
                            }
                        }
                    }
                }
                .listStyle(.plain)
                .refreshable { await vm.load() }
            } else {
                ProgressView()
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
            guard
                let id = note.userInfo?["id"] as? String,
                let box = note.userInfo?["mutation"] as? MutationBox
            else { return }
            vm?.apply(mutation: box.mutation, to: id)
        }
        .sheet(isPresented: $showCompose) {
            if let p = vm?.post {
                ComposerView(mode: .reply(p))
            }
        }
        .sheet(item: $reportTarget) { post in
            ReportSheet(subject: .post(id: post.id))
        }
    }
}
