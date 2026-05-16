import XCTest
@testable import twitbruv

final class DeepLinkParserTests: XCTestCase {
    private let webBase = URL(string: "https://example.com")!

    func testInviteAbsolute() {
        let url = URL(string: "https://example.com/invite/tok_one")!
        XCTAssertEqual(
            DeepLinkParser.parse(url: url, webBaseURL: webBase),
            .dm(.invite(token: "tok_one"))
        )
    }

    func testInviteRelativeToWebBase() {
        let url = URL(string: "/invite/tok_two", relativeTo: webBase)!
        XCTAssertEqual(
            DeepLinkParser.parse(url: url, webBaseURL: webBase),
            .dm(.invite(token: "tok_two"))
        )
    }

    func testInboxConversation() {
        let url = URL(string: "https://example.com/inbox/conv-99")!
        XCTAssertEqual(
            DeepLinkParser.parse(url: url, webBaseURL: webBase),
            .dm(.conversation(id: "conv-99"))
        )
    }

    func testHashtag() {
        let url = URL(string: "https://example.com/hashtag/rust-lang")!
        XCTAssertEqual(
            DeepLinkParser.parse(url: url, webBaseURL: webBase),
            .feed(.hashtag(tag: "rust-lang"))
        )
    }

    func testHashtagWithHashPrefix() {
        let url = URL(string: "https://example.com/hashtag/%23swift")!
        XCTAssertEqual(
            DeepLinkParser.parse(url: url, webBaseURL: webBase),
            .feed(.hashtag(tag: "swift"))
        )
    }

    func testProfile() {
        let url = URL(string: "https://example.com/alice")!
        XCTAssertEqual(
            DeepLinkParser.parse(url: url, webBaseURL: webBase),
            .feed(.profile(handle: "alice"))
        )
    }

    func testPostThread() {
        let url = URL(string: "https://example.com/bob/p/post-42")!
        XCTAssertEqual(
            DeepLinkParser.parse(url: url, webBaseURL: webBase),
            .feed(.thread(id: "post-42"))
        )
    }

    func testRejectedOAuthCallbackScheme() {
        let url = URL(string: "\(Config.oauthCallbackScheme)://app\(Config.oauthCallbackPath)")!
        XCTAssertNil(DeepLinkParser.parse(url: url, webBaseURL: webBase))
    }

    func testRejectedWrongHost() {
        let url = URL(string: "https://evil.example/invite/x")!
        XCTAssertNil(DeepLinkParser.parse(url: url, webBaseURL: webBase))
    }

    func testRejectedReservedRoot() {
        let url = URL(string: "https://example.com/search")!
        XCTAssertNil(DeepLinkParser.parse(url: url, webBaseURL: webBase))
    }

    func testWwwHostNormalization() {
        let url = URL(string: "https://www.example.com/alice")!
        let base = URL(string: "https://example.com")!
        XCTAssertEqual(
            DeepLinkParser.parse(url: url, webBaseURL: base),
            .feed(.profile(handle: "alice"))
        )
    }
}
