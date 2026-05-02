import PhotosUI
import SwiftUI

struct PickedPhoto: Identifiable, Sendable {
    let id = UUID()
    let data: Data
    let mime: String
}

@Observable
@MainActor
final class PhotoPickerController {
    var picked: [PickedPhoto] = []

    func ingest(_ items: [PhotosPickerItem]) async {
        var collected: [PickedPhoto] = []
        for item in items {
            let supported = item.supportedContentTypes
            let chosen = supported.first(where: { $0 == .heic })
                ?? supported.first(where: { $0 == .png })
                ?? supported.first(where: { $0 == .jpeg })
                ?? supported.first
            let mime: String = {
                guard let type = chosen else { return "image/jpeg" }
                if type.preferredMIMEType?.starts(with: "image/") == true {
                    return type.preferredMIMEType ?? "image/jpeg"
                }
                return "image/jpeg"
            }()
            do {
                if let data = try await item.loadTransferable(type: Data.self) {
                    collected.append(PickedPhoto(data: data, mime: mime))
                }
            } catch {
                continue
            }
        }
        picked = collected
    }

    func remove(id: PickedPhoto.ID) {
        picked.removeAll { $0.id == id }
    }

    func clear() { picked.removeAll() }
}
