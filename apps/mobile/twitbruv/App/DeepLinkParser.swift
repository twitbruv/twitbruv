import Foundation

enum DeepLinkDestination: Equatable {
    case feed(FeedRoute)
    case dm(DMRoute)
}

enum DeepLinkParser {
    private static let reservedRootSegments: Set<String> = [
        "invite",
        "hashtag",
        "inbox",
        "lists",
        "search",
        "articles",
        "chess",
        "notifications",
        "settings",
        "login",
        "auth",
        "api",
        "og",
        "compose",
        "admin",
        "bookmarks",
        "explore",
        "network",
    ]

    static func parse(url: URL, webBaseURL: URL = Config.webBaseURL) -> DeepLinkDestination? {
        if url.scheme?.lowercased() == Config.oauthCallbackScheme.lowercased() {
            return nil
        }
        guard let absolute = absoluteURL(url, webBaseURL: webBaseURL) else {
            return nil
        }
        guard hostsMatch(absolute.host, webBaseURL.host) else { return nil }

        let segments = pathSegments(absolute.path)
        guard !segments.isEmpty else { return nil }

        if segments[0] == "invite", segments.count >= 2 {
            let token = segments[1]
            guard !token.isEmpty else { return nil }
            return .dm(.invite(token: token))
        }

        if segments[0] == "hashtag", segments.count >= 2 {
            let raw = segments[1]
            let tag = raw.hasPrefix("#") ? String(raw.dropFirst()) : raw
            guard !tag.isEmpty else { return nil }
            return .feed(.hashtag(tag: tag))
        }

        if segments[0] == "inbox", segments.count >= 2 {
            let id = segments[1]
            guard !id.isEmpty else { return nil }
            return .dm(.conversation(id: id))
        }

        if segments.count >= 3, segments[1] == "p" {
            let handle = segments[0]
            guard isLikelyHandle(handle) else { return nil }
            let postId = segments[2]
            guard !postId.isEmpty else { return nil }
            return .feed(.thread(id: postId))
        }

        if segments.count == 1 {
            let raw = segments[0]
            guard !reservedRootSegments.contains(raw.lowercased()) else { return nil }
            guard isLikelyHandle(raw) else { return nil }
            return .feed(.profile(handle: raw))
        }

        return nil
    }

    private static func absoluteURL(_ raw: URL, webBaseURL: URL) -> URL? {
        let scheme = raw.scheme?.lowercased()
        if scheme == "http" || scheme == "https", raw.host != nil {
            return raw
        }
        let s = raw.absoluteString
        guard !s.isEmpty else { return nil }
        let pathOnly = s.hasPrefix("/") ? s : "/" + s
        return URL(string: pathOnly, relativeTo: webBaseURL)?.absoluteURL
    }

    private static func hostsMatch(_ urlHost: String?, _ baseHost: String?) -> Bool {
        guard let normalizedURL = normalizeHost(urlHost),
            let normalizedBase = normalizeHost(baseHost)
        else {
            return false
        }
        return normalizedURL == normalizedBase
    }

    private static func normalizeHost(_ host: String?) -> String? {
        guard var h = host?.lowercased() else { return nil }
        if h.hasPrefix("www.") {
            h = String(h.dropFirst(4))
        }
        return h
    }

    private static func pathSegments(_ path: String) -> [String] {
        path.split(separator: "/").map { raw in
            String(raw).removingPercentEncoding ?? String(raw)
        }
        .filter { !$0.isEmpty }
    }

    private static func isLikelyHandle(_ raw: String) -> Bool {
        guard raw.count >= 3, raw.count <= 20 else { return false }
        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "_"))
        return raw.unicodeScalars.allSatisfy { allowed.contains($0) }
    }
}
