import Foundation

extension Poll {
    static var preview: Poll {
        Poll(
            id: "poll-preview-1",
            closesAt: Date().addingTimeInterval(86_400),
            allowMultiple: false,
            totalVotes: 24,
            closed: false,
            options: [
                Option(id: "o1", position: 0, text: "Option A", voteCount: 14),
                Option(id: "o2", position: 1, text: "Option B", voteCount: 10),
            ],
            viewerVoteOptionIds: nil
        )
    }
}
