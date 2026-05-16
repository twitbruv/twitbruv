import Foundation
import Observation

@Observable
final class SearchRecentsStore {
    static let maxItems = 10
    private static let storageKey = "tb.search.recents.v1"

    private(set) var items: [String]
    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        if let data = defaults.data(forKey: Self.storageKey),
           let decoded = try? JSONDecoder().decode([String].self, from: data)
        {
            self.items = Array(decoded.prefix(Self.maxItems))
        } else {
            self.items = []
        }
    }

    func add(_ rawQuery: String) {
        let trimmed = rawQuery.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count >= 2 else { return }
        items.removeAll { $0.caseInsensitiveCompare(trimmed) == .orderedSame }
        items.insert(trimmed, at: 0)
        if items.count > Self.maxItems {
            items = Array(items.prefix(Self.maxItems))
        }
        persist()
    }

    func remove(_ query: String) {
        items.removeAll { $0.caseInsensitiveCompare(query) == .orderedSame }
        persist()
    }

    func clear() {
        items.removeAll()
        persist()
    }

    private func persist() {
        if let data = try? JSONEncoder().encode(items) {
            defaults.set(data, forKey: Self.storageKey)
        }
    }
}
