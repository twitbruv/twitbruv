import XCTest
@testable import twitbruv

final class SearchFiltersTests: XCTestCase {
    func testParseEmpty() {
        XCTAssertEqual(SearchFiltersCodec.parse(""), SearchFilters())
        XCTAssertEqual(SearchFiltersCodec.parse("   "), SearchFilters())
    }

    func testParsePlainText() {
        let f = SearchFiltersCodec.parse("swift concurrency")
        XCTAssertEqual(f.text, "swift concurrency")
        XCTAssertFalse(f.hasAnyOperator)
    }

    func testStripLeadingAtFromBareWords() {
        let f = SearchFiltersCodec.parse("@alice notes")
        XCTAssertEqual(f.text, "alice notes")
        XCTAssertNil(f.fromHandle)
    }

    func testFromOperator() {
        let f = SearchFiltersCodec.parse("from:eve hello")
        XCTAssertEqual(f.fromHandle, "eve")
        XCTAssertEqual(f.text, "hello")
    }

    func testFromOperatorStripsAt() {
        let f = SearchFiltersCodec.parse("from:@Dave")
        XCTAssertEqual(f.fromHandle, "dave")
    }

    func testInvalidHandleFallsBackToFreeWord() {
        let f = SearchFiltersCodec.parse("from:not-a-valid-handle?")
        XCTAssertNil(f.fromHandle)
        XCTAssertTrue(f.text.contains("from:not-a-valid-handle?"))
    }

    func testToMentionAliases() {
        XCTAssertEqual(SearchFiltersCodec.parse("to:bob").toHandle, "bob")
        XCTAssertEqual(SearchFiltersCodec.parse("mention:bob").toHandle, "bob")
        XCTAssertEqual(SearchFiltersCodec.parse("mentions:bob").toHandle, "bob")
    }

    func testHasOperators() {
        let f = SearchFiltersCodec.parse("has:media has:link has:poll vacation")
        XCTAssertTrue(f.hasMedia)
        XCTAssertTrue(f.hasLink)
        XCTAssertTrue(f.hasPoll)
        XCTAssertEqual(f.text, "vacation")
    }

    func testHasImageAlias() {
        XCTAssertTrue(SearchFiltersCodec.parse("has:image").hasMedia)
        XCTAssertTrue(SearchFiltersCodec.parse("has:images").hasMedia)
        XCTAssertTrue(SearchFiltersCodec.parse("has:links").hasLink)
    }

    func testHasUnknownFallsBack() {
        let f = SearchFiltersCodec.parse("has:videos")
        XCTAssertFalse(f.hasMedia)
        XCTAssertEqual(f.text, "has:videos")
    }

    func testLang() {
        XCTAssertEqual(SearchFiltersCodec.parse("lang:en").lang, "en")
        XCTAssertEqual(SearchFiltersCodec.parse("lang:en-US").lang, "en-us")
        XCTAssertNil(SearchFiltersCodec.parse("lang:not_a_lang").lang)
    }

    func testDateOperators() {
        let f = SearchFiltersCodec.parse("since:2026-01-01 until:2026-12-31")
        XCTAssertNotNil(f.since)
        XCTAssertNotNil(f.until)
        XCTAssertEqual(SearchFiltersCodec.parse("since:01-01-2026").since, nil)
    }

    func testEngagementOperators() {
        let f = SearchFiltersCodec.parse("min_likes:50 min_replies:5")
        XCTAssertEqual(f.minLikes, 50)
        XCTAssertEqual(f.minReplies, 5)
    }

    func testEngagementAliases() {
        XCTAssertEqual(SearchFiltersCodec.parse("minlikes:10").minLikes, 10)
        XCTAssertEqual(SearchFiltersCodec.parse("minreplies:3").minReplies, 3)
    }

    func testEngagementOutOfRange() {
        XCTAssertNil(SearchFiltersCodec.parse("min_likes:-5").minLikes)
        XCTAssertNil(SearchFiltersCodec.parse("min_likes:abc").minLikes)
        XCTAssertNil(SearchFiltersCodec.parse("min_likes:99999999").minLikes)
    }

    func testBuildEmpty() {
        XCTAssertEqual(SearchFiltersCodec.build(SearchFilters()), "")
    }

    func testBuildTextOnly() {
        var f = SearchFilters()
        f.text = "hello world"
        XCTAssertEqual(SearchFiltersCodec.build(f), "hello world")
    }

    func testBuildAllFilters() {
        var f = SearchFilters()
        f.text = "vacation"
        f.fromHandle = "eve"
        f.hasMedia = true
        f.minLikes = 50
        let result = SearchFiltersCodec.build(f)
        XCTAssertTrue(result.contains("vacation"))
        XCTAssertTrue(result.contains("from:eve"))
        XCTAssertTrue(result.contains("has:media"))
        XCTAssertTrue(result.contains("min_likes:50"))
    }

    func testRoundTripPreservesAll() {
        var f = SearchFilters()
        f.text = "swift"
        f.fromHandle = "eve"
        f.toHandle = "bob"
        f.hasMedia = true
        f.hasLink = true
        f.hasPoll = true
        f.lang = "en"
        f.minLikes = 100
        f.minReplies = 10
        let built = SearchFiltersCodec.build(f)
        let parsed = SearchFiltersCodec.parse(built)
        XCTAssertEqual(parsed.text, f.text)
        XCTAssertEqual(parsed.fromHandle, f.fromHandle)
        XCTAssertEqual(parsed.toHandle, f.toHandle)
        XCTAssertEqual(parsed.hasMedia, f.hasMedia)
        XCTAssertEqual(parsed.hasLink, f.hasLink)
        XCTAssertEqual(parsed.hasPoll, f.hasPoll)
        XCTAssertEqual(parsed.lang, f.lang)
        XCTAssertEqual(parsed.minLikes, f.minLikes)
        XCTAssertEqual(parsed.minReplies, f.minReplies)
    }

    func testActiveOperatorCount() {
        XCTAssertEqual(SearchFilters().activeOperatorCount, 0)
        var f = SearchFilters()
        f.fromHandle = "eve"
        f.hasMedia = true
        f.minLikes = 5
        XCTAssertEqual(f.activeOperatorCount, 3)
    }

    func testHasAnyOperator() {
        XCTAssertFalse(SearchFilters().hasAnyOperator)
        var f = SearchFilters()
        f.text = "just text"
        XCTAssertFalse(f.hasAnyOperator)
        f.hasMedia = true
        XCTAssertTrue(f.hasAnyOperator)
    }
}
