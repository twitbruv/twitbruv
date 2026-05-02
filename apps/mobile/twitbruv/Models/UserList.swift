import Foundation

struct UserList: Codable, Identifiable, Hashable, Sendable {
    let id: String
    var name: String
    var description: String?
    var visibility: String?
    var owner: UserSummary?
    var memberCount: Int?
    var pinned: Bool?
    var createdAt: Date?
    var updatedAt: Date?
}

struct ListsResponse: Codable, Sendable {
    let lists: [UserList]
}

struct ListResponse: Codable, Sendable {
    let list: UserList
}

struct ListMembersResponse: Codable, Sendable {
    let members: [UserSummary]
    let nextCursor: String?
}

struct ListedOnResponse: Codable, Sendable {
    let lists: [UserList]
}

struct CreateListBody: Codable, Sendable {
    var name: String
    var description: String?
    var visibility: String?
}

struct UpdateListBody: Codable, Sendable {
    var name: String?
    var description: String?
    var visibility: String?
}

struct AddMembersBody: Codable, Sendable {
    var userIds: [String]
}
