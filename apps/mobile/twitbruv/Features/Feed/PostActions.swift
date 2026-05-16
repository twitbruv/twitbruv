import Foundation
import os

enum PostMutation: Sendable {
    case toggleLike(value: Bool)
    case toggleRepost(value: Bool)
    case toggleBookmark(value: Bool)
    case togglePin(value: Bool)
    case toggleHidden(value: Bool)
    case votePoll(pollId: String, optionId: String)
    case restorePoll(pollId: String, optionIds: [String]?)
    case deleted

    func apply(to post: inout Post) {
        switch self {
        case .toggleLike(let v):
            let was = post.viewer?.liked == true
            if was != v {
                post.viewer?.liked = v
                post.counts.likes += v ? 1 : -1
            }
        case .toggleRepost(let v):
            let was = post.viewer?.reposted == true
            if was != v {
                post.viewer?.reposted = v
                post.counts.reposts += v ? 1 : -1
            }
        case .toggleBookmark(let v):
            let was = post.viewer?.bookmarked == true
            if was != v {
                post.viewer?.bookmarked = v
                post.counts.bookmarks += v ? 1 : -1
            }
        case .togglePin(let v):
            post.pinned = v
        case .toggleHidden(let v):
            post.hidden = v
        case .votePoll(let pollId, let optionId):
            post.applyPollVote(pollId: pollId, optionIds: [optionId])
        case .restorePoll(let pollId, let optionIds):
            post.applyPollVote(pollId: pollId, optionIds: optionIds)
        case .deleted:
            break
        }
    }
}

private extension Post {
    mutating func applyPollVote(pollId: String, optionIds: [String]?) {
        guard var currentPoll = poll, currentPoll.id == pollId else { return }
        let previous = Set(currentPoll.viewerVoteOptionIds ?? [])
        let next = Set(optionIds ?? [])
        for idx in currentPoll.options.indices {
            let optionId = currentPoll.options[idx].id
            let had = previous.contains(optionId)
            let has = next.contains(optionId)
            if had != has {
                currentPoll.options[idx].voteCount += has ? 1 : -1
            }
        }
        if previous.isEmpty && !next.isEmpty {
            currentPoll.totalVotes += 1
        } else if !previous.isEmpty && next.isEmpty {
            currentPoll.totalVotes = max(0, currentPoll.totalVotes - 1)
        }
        currentPoll.viewerVoteOptionIds = optionIds
        poll = currentPoll
    }
}

extension Notification.Name {
    static let postMutated = Notification.Name("twitbruv.postMutated")
    static let composedPostCreated = Notification.Name("twitbruv.composedPostCreated")
}

@MainActor
final class PostActions {
    private let api: APIClient
    private let log = Logger(subsystem: "app.twitbruv.ios", category: "post-actions")

    init(api: APIClient) { self.api = api }

    func toggleLike(_ post: Post) async {
        let liked = post.viewer?.liked == true
        broadcast(id: post.id, mutation: .toggleLike(value: !liked))
        do {
            if liked {
                try await api.sendVoid(API.Posts.unlike(post.id))
            } else {
                try await api.sendVoid(API.Posts.like(post.id))
            }
        } catch {
            broadcast(id: post.id, mutation: .toggleLike(value: liked))
            log.warning("toggleLike rollback id=\(post.id) err=\(String(describing: error))")
        }
    }

    func toggleRepost(_ post: Post) async {
        let reposted = post.viewer?.reposted == true
        broadcast(id: post.id, mutation: .toggleRepost(value: !reposted))
        do {
            if reposted {
                try await api.sendVoid(API.Posts.unrepost(post.id))
            } else {
                try await api.sendVoid(API.Posts.repost(post.id))
            }
        } catch {
            broadcast(id: post.id, mutation: .toggleRepost(value: reposted))
        }
    }

    func toggleBookmark(_ post: Post) async {
        let bookmarked = post.viewer?.bookmarked == true
        broadcast(id: post.id, mutation: .toggleBookmark(value: !bookmarked))
        do {
            if bookmarked {
                try await api.sendVoid(API.Posts.unbookmark(post.id))
            } else {
                try await api.sendVoid(API.Posts.bookmark(post.id))
            }
        } catch {
            broadcast(id: post.id, mutation: .toggleBookmark(value: bookmarked))
        }
    }

    func votePoll(pollId: String, optionId: String, previousOptionIds: [String]? = nil) async {
        broadcast(pollId: pollId, mutation: .votePoll(pollId: pollId, optionId: optionId))
        do {
            try await api.sendVoid(
                API.Polls.vote(pollId),
                body: PollVoteBody(optionIds: [optionId])
            )
        } catch {
            broadcast(
                pollId: pollId,
                mutation: .restorePoll(pollId: pollId, optionIds: previousOptionIds)
            )
        }
    }

    func togglePin(_ post: Post) async {
        let pinned = post.pinned == true
        do {
            if pinned {
                try await api.sendVoid(API.Posts.unpin(post.id))
            } else {
                try await api.sendVoid(API.Posts.pin(post.id))
            }
            broadcast(id: post.id, mutation: .togglePin(value: !pinned))
        } catch {
            log.warning("togglePin err=\(String(describing: error))")
        }
    }

    func toggleHidden(_ post: Post) async {
        let hidden = post.hidden == true
        do {
            if hidden {
                try await api.sendVoid(API.Posts.unhide(post.id))
            } else {
                try await api.sendVoid(API.Posts.hide(post.id))
            }
            broadcast(id: post.id, mutation: .toggleHidden(value: !hidden))
        } catch {
            log.warning("toggleHidden err=\(String(describing: error))")
        }
    }

    func delete(_ post: Post) async {
        do {
            try await api.sendVoid(API.Posts.delete(post.id))
            broadcast(id: post.id, mutation: .deleted)
        } catch {
            log.warning("delete err=\(String(describing: error))")
        }
    }

    private func broadcast(id: String, mutation: PostMutation) {
        NotificationCenter.default.post(
            name: .postMutated,
            object: nil,
            userInfo: ["id": id, "mutation": MutationBox(mutation)]
        )
    }

    private func broadcast(pollId: String, mutation: PostMutation) {
        NotificationCenter.default.post(
            name: .postMutated,
            object: nil,
            userInfo: ["pollId": pollId, "mutation": MutationBox(mutation)]
        )
    }
}

final class MutationBox: NSObject, @unchecked Sendable {
    let mutation: PostMutation
    init(_ mutation: PostMutation) { self.mutation = mutation }
}
