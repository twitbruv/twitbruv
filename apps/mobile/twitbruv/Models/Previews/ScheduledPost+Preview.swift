import Foundation

extension ScheduledPost {
    static var previewScheduled: ScheduledPost {
        ScheduledPost(
            id: "sched-preview-1",
            kind: "scheduled",
            text: "Scheduled preview post",
            mediaIds: nil,
            visibility: "public",
            sensitive: false,
            contentWarning: nil,
            replyRestriction: "everyone",
            scheduledAt: Date().addingTimeInterval(3600),
            createdAt: Date(),
            updatedAt: Date(),
            publishedAt: nil
        )
    }

    static var previewDraft: ScheduledPost {
        ScheduledPost(
            id: "sched-preview-draft-1",
            kind: "draft",
            text: "Draft preview",
            mediaIds: nil,
            visibility: "public",
            sensitive: false,
            contentWarning: nil,
            replyRestriction: "everyone",
            scheduledAt: nil,
            createdAt: Date(),
            updatedAt: Date(),
            publishedAt: nil
        )
    }
}
