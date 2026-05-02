import Foundation

struct Poll: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let closesAt: Date
    var allowMultiple: Bool
    var totalVotes: Int
    var closed: Bool
    var options: [Option]
    var viewerVoteOptionIds: [String]?

    struct Option: Codable, Identifiable, Hashable, Sendable {
        let id: String
        let position: Int
        let text: String
        var voteCount: Int
    }
}

struct PollVoteBody: Codable, Sendable {
    let optionIds: [String]
}
