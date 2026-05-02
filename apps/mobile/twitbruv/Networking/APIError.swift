import Foundation

enum APIError: Error, Equatable, LocalizedError, Sendable {
    case unauthorized
    case forbidden(code: String?)
    case rateLimited(retryAfterSec: Int, bucket: String?)
    case maintenance
    case http(status: Int, code: String?, message: String?)
    case network(URLError)
    case decoding(String)
    case invalidResponse

    static func == (lhs: APIError, rhs: APIError) -> Bool {
        switch (lhs, rhs) {
        case (.unauthorized, .unauthorized), (.maintenance, .maintenance),
             (.invalidResponse, .invalidResponse):
            return true
        case let (.forbidden(a), .forbidden(b)):
            return a == b
        case let (.rateLimited(la, lb), .rateLimited(ra, rb)):
            return la == ra && lb == rb
        case let (.http(la, lb, lc), .http(ra, rb, rc)):
            return la == ra && lb == rb && lc == rc
        case let (.network(a), .network(b)):
            return a.code == b.code
        case let (.decoding(a), .decoding(b)):
            return a == b
        default:
            return false
        }
    }

    var errorDescription: String? {
        switch self {
        case .unauthorized: return "You're signed out."
        case .forbidden(let code):
            switch code {
            case "email_not_verified": return "Verify your email to continue."
            case "handle_required": return "Pick a handle to continue."
            case "banned": return "This account is unavailable."
            default: return code.map { "Forbidden: \($0)" } ?? "Forbidden."
            }
        case .rateLimited(let s, _):
            return "Too many requests. Try again in \(s)s."
        case .maintenance: return "We're undergoing maintenance. Please try again shortly."
        case .http(_, let code, let message):
            return message ?? code ?? "Request failed."
        case .network(let e): return e.localizedDescription
        case .decoding(let m): return "Couldn't read server response. \(m)"
        case .invalidResponse: return "Invalid response from server."
        }
    }
}

struct ErrorPayload: Decodable {
    let error: String?
    let message: String?
    let bucket: String?
    let retryAfterSec: Int?
}
