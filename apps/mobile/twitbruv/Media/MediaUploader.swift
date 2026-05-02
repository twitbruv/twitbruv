import Foundation
import ImageIO
import UniformTypeIdentifiers
import os

actor MediaUploader {
    private let api: APIClient
    private let session: URLSession
    private let log = Logger(subsystem: "app.twitbruv.ios", category: "media-upload")

    init(api: APIClient) {
        self.api = api
        self.session = api.underlyingSession()
    }

    func upload(data inputData: Data, mimeType inputMime: String) async throws -> Media {
        let (data, mime) = try Self.normalize(data: inputData, mime: inputMime)

        let intent: MediaIntentResponse = try await api.send(
            API.Media.intent(),
            body: MediaIntentBody(mime: mime, size: data.count)
        )

        guard let putURL = URL(string: intent.uploadUrl) else {
            throw APIError.invalidResponse
        }
        var request = URLRequest(url: putURL)
        request.httpMethod = "PUT"
        request.setValue(mime, forHTTPHeaderField: "Content-Type")
        for (k, v) in intent.uploadHeaders ?? [:] {
            request.setValue(v, forHTTPHeaderField: k)
        }
        let (_, response) = try await session.upload(for: request, from: data)
        guard
            let http = response as? HTTPURLResponse,
            (200..<300).contains(http.statusCode)
        else {
            throw APIError.invalidResponse
        }

        try await api.sendVoid(API.Media.finalize(intent.id))
        return try await pollUntilReady(id: intent.id)
    }

    private func pollUntilReady(id: String) async throws -> Media {
        let deadline = Date().addingTimeInterval(45)
        var delayMs: UInt64 = 600
        while Date() < deadline {
            let response: MediaResponse = try await api.get(API.Media.get(id))
            let state = response.media.processingState ?? "ready"
            if state == "ready" { return response.media }
            if state == "failed" || state == "flagged" {
                throw APIError.http(status: 0, code: state, message: "Media \(state)")
            }
            try await Task.sleep(nanoseconds: delayMs * 1_000_000)
            delayMs = min(delayMs * 2, 4_000)
        }
        throw APIError.http(status: 0, code: "timeout", message: "Media still processing")
    }

    static func normalize(data: Data, mime: String) throws -> (Data, String) {
        if mime == "image/heic" || mime == "image/heif" {
            guard
                let src = CGImageSourceCreateWithData(data as CFData, nil),
                let cg = CGImageSourceCreateImageAtIndex(src, 0, nil)
            else {
                return (data, mime)
            }
            let out = NSMutableData()
            guard
                let dest = CGImageDestinationCreateWithData(
                    out, UTType.jpeg.identifier as CFString, 1, nil
                )
            else {
                return (data, mime)
            }
            CGImageDestinationAddImage(dest, cg, [
                kCGImageDestinationLossyCompressionQuality: 0.9
            ] as CFDictionary)
            CGImageDestinationFinalize(dest)
            return (out as Data, "image/jpeg")
        }
        return (data, mime)
    }
}
