import Foundation
import Observation

@Observable
@MainActor
final class PagedLoader<Item: Identifiable & Sendable & Decodable, Page: Decodable & Sendable> {
    private(set) var items: [Item] = []
    private(set) var nextCursor: String?
    private(set) var isLoading = false
    private(set) var isReloading = false
    private(set) var error: APIError?
    private(set) var didLoadOnce = false

    private let api: APIClient
    private let endpoint: (_ cursor: String?) -> Endpoint
    private let extract: (Page) -> (items: [Item], nextCursor: String?)

    init(
        api: APIClient,
        endpoint: @escaping (_ cursor: String?) -> Endpoint,
        extract: @escaping (Page) -> (items: [Item], nextCursor: String?)
    ) {
        self.api = api
        self.endpoint = endpoint
        self.extract = extract
    }

    func loadInitial() async {
        guard !didLoadOnce else { return }
        await reload()
    }

    func reload() async {
        if isReloading { return }
        isReloading = true
        error = nil
        defer { isReloading = false }
        do {
            let page: Page = try await api.get(endpoint(nil))
            let parsed = extract(page)
            items = parsed.items
            nextCursor = parsed.nextCursor
            didLoadOnce = true
        } catch let e as APIError {
            self.error = e
        } catch {
            self.error = .invalidResponse
        }
    }

    func loadMore() async {
        guard !isLoading, let cursor = nextCursor else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            let page: Page = try await api.get(endpoint(cursor))
            let parsed = extract(page)
            items.append(contentsOf: parsed.items)
            nextCursor = parsed.nextCursor
        } catch let e as APIError {
            self.error = e
        } catch {
            self.error = .invalidResponse
        }
    }

    func patch(id: Item.ID, transform: (inout Item) -> Void) {
        guard let idx = items.firstIndex(where: { $0.id == id }) else { return }
        transform(&items[idx])
    }

    func patchAll(transform: (inout Item) -> Void) {
        for idx in items.indices {
            transform(&items[idx])
        }
    }

    func remove(id: Item.ID) {
        items.removeAll { $0.id == id }
    }

    func prepend(_ item: Item) {
        items.insert(item, at: 0)
    }
}
