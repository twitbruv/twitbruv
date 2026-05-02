import Foundation
import os

@MainActor
final class APIClient {
    private let baseURL: URL
    private let session: URLSession
    private let log = Logger(subsystem: "app.twitbruv.ios", category: "api")

    weak var delegate: APIClientDelegate?

    var debugBaseURL: URL { baseURL }

    init(baseURL: URL = Config.apiBaseURL) {
        self.baseURL = baseURL
        let config = URLSessionConfiguration.default
        config.httpCookieAcceptPolicy = .always
        config.httpCookieStorage = HTTPCookieStorage.shared
        config.httpShouldSetCookies = true
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        config.urlCache = nil
        config.httpAdditionalHeaders = [
            "Origin": Config.mobileOrigin,
            "Accept": "application/json",
        ]
        self.session = URLSession(configuration: config)
    }

    func get<T: Decodable & Sendable>(_ endpoint: Endpoint) async throws -> T {
        try await perform(endpoint, body: nil as EmptyBody?)
    }

    func send<T: Decodable & Sendable, B: Encodable & Sendable>(
        _ endpoint: Endpoint,
        body: B? = nil
    ) async throws -> T {
        try await perform(endpoint, body: body)
    }

    func sendVoid<B: Encodable & Sendable>(
        _ endpoint: Endpoint,
        body: B? = nil
    ) async throws {
        let _: EmptyResponse = try await perform(endpoint, body: body)
    }

    func sendVoid(_ endpoint: Endpoint) async throws {
        let _: EmptyResponse = try await perform(endpoint, body: nil as EmptyBody?)
    }

    nonisolated func makeRequest(_ endpoint: Endpoint, accept: String? = nil) throws -> URLRequest {
        guard var components = URLComponents(
            url: baseURL.appendingPathComponent(endpoint.path), resolvingAgainstBaseURL: false
        ) else {
            throw APIError.invalidResponse
        }
        if !endpoint.query.isEmpty {
            components.queryItems = endpoint.query
        }
        guard let url = components.url else { throw APIError.invalidResponse }
        var request = URLRequest(url: url)
        request.httpMethod = endpoint.method.rawValue
        request.setValue(Config.mobileOrigin, forHTTPHeaderField: "Origin")
        if let accept { request.setValue(accept, forHTTPHeaderField: "Accept") }
        return request
    }

    nonisolated func underlyingSession() -> URLSession { session }

    private func perform<T: Decodable & Sendable, B: Encodable & Sendable>(
        _ endpoint: Endpoint,
        body: B?
    ) async throws -> T {
        var request = try makeRequest(endpoint)
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            do {
                request.httpBody = try JSONCoders.encoder.encode(body)
            } catch {
                throw APIError.decoding("encode \(error)")
            }
        }

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch let urlError as URLError {
            throw APIError.network(urlError)
        } catch {
            throw APIError.invalidResponse
        }

        guard let http = response as? HTTPURLResponse else { throw APIError.invalidResponse }
        let status = http.statusCode

        if (200..<300).contains(status) {
            if T.self == EmptyResponse.self {
                return EmptyResponse() as! T
            }
            do {
                return try JSONCoders.decoder.decode(T.self, from: data)
            } catch {
                log.error("decode error path=\(endpoint.path) status=\(status) err=\(String(describing: error))")
                throw APIError.decoding(String(describing: error))
            }
        }

        let payload = try? JSONCoders.decoder.decode(ErrorPayload.self, from: data)
        let code = payload?.error
        let msg = payload?.message

        switch status {
        case 401:
            delegate?.apiClientDidReceiveUnauthorized()
            throw APIError.unauthorized
        case 403:
            if code == "email_not_verified" || code == "handle_required" {
                delegate?.apiClientNeedsOnboarding(code: code ?? "")
            }
            throw APIError.forbidden(code: code)
        case 429:
            let retryAfter = http.value(forHTTPHeaderField: "Retry-After").flatMap(Int.init)
                ?? payload?.retryAfterSec ?? 30
            delegate?.apiClientWasRateLimited(
                retryAfterSec: retryAfter, bucket: payload?.bucket
            )
            throw APIError.rateLimited(retryAfterSec: retryAfter, bucket: payload?.bucket)
        case 503 where code == "maintenance":
            delegate?.apiClientDidEnterMaintenance()
            throw APIError.maintenance
        default:
            throw APIError.http(status: status, code: code, message: msg)
        }
    }
}

@MainActor
protocol APIClientDelegate: AnyObject {
    func apiClientDidReceiveUnauthorized()
    func apiClientNeedsOnboarding(code: String)
    func apiClientWasRateLimited(retryAfterSec: Int, bucket: String?)
    func apiClientDidEnterMaintenance()
}

struct EmptyBody: Encodable, Sendable {}
struct EmptyResponse: Decodable, Sendable {}

struct OkResponse: Decodable, Sendable {
    let ok: Bool?
}
