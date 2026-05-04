import Foundation

extension UserList {
    static var preview: UserList {
        UserList(
            id: PreviewConst.listId,
            name: "Preview list",
            description: "Accounts to watch",
            visibility: "public",
            owner: .preview,
            memberCount: 12,
            pinned: false,
            createdAt: Date(),
            updatedAt: Date()
        )
    }
}
