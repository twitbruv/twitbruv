import XCTest
@testable import twitbruv

final class SearchRecentsStoreTests: XCTestCase {
    private var defaults: UserDefaults!
    private let suiteName = "tb.tests.search-recents"

    override func setUp() {
        super.setUp()
        UserDefaults().removePersistentDomain(forName: suiteName)
        defaults = UserDefaults(suiteName: suiteName)
    }

    override func tearDown() {
        UserDefaults().removePersistentDomain(forName: suiteName)
        defaults = nil
        super.tearDown()
    }

    func testEmptyOnInit() {
        let store = SearchRecentsStore(defaults: defaults)
        XCTAssertEqual(store.items, [])
    }

    func testAddInsertsAtFront() {
        let store = SearchRecentsStore(defaults: defaults)
        store.add("first")
        store.add("second")
        XCTAssertEqual(store.items, ["second", "first"])
    }

    func testAddDedupesCaseInsensitively() {
        let store = SearchRecentsStore(defaults: defaults)
        store.add("Swift")
        store.add("Concurrency")
        store.add("swift")
        XCTAssertEqual(store.items, ["swift", "Concurrency"])
    }

    func testAddIgnoresShortQueries() {
        let store = SearchRecentsStore(defaults: defaults)
        store.add("")
        store.add(" ")
        store.add("a")
        XCTAssertEqual(store.items, [])
    }

    func testAddTrimsWhitespace() {
        let store = SearchRecentsStore(defaults: defaults)
        store.add("  swift  ")
        XCTAssertEqual(store.items, ["swift"])
    }

    func testAddCapsAtMaxItems() {
        let store = SearchRecentsStore(defaults: defaults)
        for i in 1...15 {
            store.add("query-\(i)")
        }
        XCTAssertEqual(store.items.count, SearchRecentsStore.maxItems)
        XCTAssertEqual(store.items.first, "query-15")
        XCTAssertEqual(store.items.last, "query-6")
    }

    func testRemove() {
        let store = SearchRecentsStore(defaults: defaults)
        store.add("alpha")
        store.add("beta")
        store.remove("alpha")
        XCTAssertEqual(store.items, ["beta"])
    }

    func testRemoveCaseInsensitive() {
        let store = SearchRecentsStore(defaults: defaults)
        store.add("Alpha")
        store.remove("alpha")
        XCTAssertEqual(store.items, [])
    }

    func testClear() {
        let store = SearchRecentsStore(defaults: defaults)
        store.add("alpha")
        store.add("beta")
        store.clear()
        XCTAssertEqual(store.items, [])
    }

    func testPersistsAcrossInstances() {
        let store1 = SearchRecentsStore(defaults: defaults)
        store1.add("persisted")
        store1.add("also")

        let store2 = SearchRecentsStore(defaults: defaults)
        XCTAssertEqual(store2.items, ["also", "persisted"])
    }

    func testRehydratesAtMostMaxItems() {
        let data = try! JSONEncoder().encode((1...20).map { "q\($0)" })
        defaults.set(data, forKey: "tb.search.recents.v1")
        let store = SearchRecentsStore(defaults: defaults)
        XCTAssertEqual(store.items.count, SearchRecentsStore.maxItems)
    }
}
