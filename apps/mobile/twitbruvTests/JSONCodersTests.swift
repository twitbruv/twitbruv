import XCTest
@testable import twitbruv

final class JSONCodersTests: XCTestCase {
    private struct DateEnvelope: Codable, Equatable {
        let at: Date
    }

    func testDecodesFractionalISO8601() throws {
        let data = Data(#"{"at":"2024-06-01T12:34:56.789Z"}"#.utf8)
        let v = try JSONCoders.decoder.decode(DateEnvelope.self, from: data)
        XCTAssertEqual(v.at.timeIntervalSince1970, 1_717_249_496.789, accuracy: 0.001)
    }

    func testDecodesPlainISO8601() throws {
        let data = Data(#"{"at":"2024-06-01T12:34:56Z"}"#.utf8)
        let v = try JSONCoders.decoder.decode(DateEnvelope.self, from: data)
        XCTAssertEqual(v.at.timeIntervalSince1970, 1_717_249_496, accuracy: 0.001)
    }

    func testRoundTripEncodesWithFractionalSeconds() throws {
        let original = DateEnvelope(at: Date(timeIntervalSince1970: 1_717_249_496.5))
        let data = try JSONCoders.encoder.encode(original)
        let back = try JSONCoders.decoder.decode(DateEnvelope.self, from: data)
        XCTAssertEqual(
            back.at.timeIntervalSince1970,
            original.at.timeIntervalSince1970,
            accuracy: 0.001
        )
    }
}
