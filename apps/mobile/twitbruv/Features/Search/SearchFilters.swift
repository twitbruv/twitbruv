import Foundation

struct SearchFilters: Equatable, Hashable {
    var text: String = ""
    var fromHandle: String?
    var toHandle: String?
    var hasMedia: Bool = false
    var hasLink: Bool = false
    var hasPoll: Bool = false
    var lang: String?
    var since: Date?
    var until: Date?
    var minLikes: Int?
    var minReplies: Int?

    var hasAnyOperator: Bool {
        fromHandle != nil ||
            toHandle != nil ||
            hasMedia ||
            hasLink ||
            hasPoll ||
            lang != nil ||
            since != nil ||
            until != nil ||
            minLikes != nil ||
            minReplies != nil
    }

    var activeOperatorCount: Int {
        var n = 0
        if fromHandle != nil { n += 1 }
        if toHandle != nil { n += 1 }
        if hasMedia { n += 1 }
        if hasLink { n += 1 }
        if hasPoll { n += 1 }
        if lang != nil { n += 1 }
        if since != nil { n += 1 }
        if until != nil { n += 1 }
        if minLikes != nil { n += 1 }
        if minReplies != nil { n += 1 }
        return n
    }
}

enum SearchFiltersCodec {
    private static let isoFormatter: DateFormatter = {
        let df = DateFormatter()
        df.calendar = Calendar(identifier: .gregorian)
        df.locale = Locale(identifier: "en_US_POSIX")
        df.timeZone = TimeZone(secondsFromGMT: 0)
        df.dateFormat = "yyyy-MM-dd"
        return df
    }()

    private static let handlePattern = #"^[A-Za-z0-9_]{1,32}$"#
    private static let langPattern = #"^[a-z]{2,3}(?:-[A-Za-z]{2,4})?$"#

    static func parse(_ raw: String) -> SearchFilters {
        var out = SearchFilters()
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return out }

        var free: [String] = []
        for token in trimmed.split(whereSeparator: { $0.isWhitespace }) {
            let word = String(token)
            guard let colon = word.firstIndex(of: ":") else {
                free.append(stripLeadingAt(word))
                continue
            }
            let key = word[..<colon].lowercased()
            let val = String(word[word.index(after: colon)...])
            if val.isEmpty {
                free.append(word)
                continue
            }
            if !applyOperator(&out, key: key, val: val) {
                free.append(word)
            }
        }
        out.text = free.joined(separator: " ").trimmingCharacters(in: .whitespacesAndNewlines)
        return out
    }

    static func build(_ filters: SearchFilters) -> String {
        var parts: [String] = []
        let trimmedText = filters.text.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmedText.isEmpty {
            parts.append(trimmedText)
        }
        if let h = filters.fromHandle, !h.isEmpty {
            parts.append("from:\(h)")
        }
        if let h = filters.toHandle, !h.isEmpty {
            parts.append("to:\(h)")
        }
        if filters.hasMedia { parts.append("has:media") }
        if filters.hasLink { parts.append("has:link") }
        if filters.hasPoll { parts.append("has:poll") }
        if let lang = filters.lang, !lang.isEmpty {
            parts.append("lang:\(lang)")
        }
        if let since = filters.since {
            parts.append("since:\(isoFormatter.string(from: since))")
        }
        if let until = filters.until {
            parts.append("until:\(isoFormatter.string(from: until))")
        }
        if let n = filters.minLikes {
            parts.append("min_likes:\(n)")
        }
        if let n = filters.minReplies {
            parts.append("min_replies:\(n)")
        }
        return parts.joined(separator: " ")
    }

    private static func applyOperator(_ out: inout SearchFilters, key: String, val: String) -> Bool {
        switch key {
        case "from":
            let h = val.hasPrefix("@") ? String(val.dropFirst()) : val
            guard matches(h, pattern: handlePattern) else { return false }
            out.fromHandle = h.lowercased()
            return true
        case "to", "mention", "mentions":
            let h = val.hasPrefix("@") ? String(val.dropFirst()) : val
            guard matches(h, pattern: handlePattern) else { return false }
            out.toHandle = h.lowercased()
            return true
        case "has":
            switch val.lowercased() {
            case "media", "image", "images":
                out.hasMedia = true
                return true
            case "link", "links":
                out.hasLink = true
                return true
            case "poll":
                out.hasPoll = true
                return true
            default:
                return false
            }
        case "lang":
            guard matches(val, pattern: langPattern) else { return false }
            out.lang = val.lowercased()
            return true
        case "since":
            guard let date = isoFormatter.date(from: val) else { return false }
            out.since = date
            return true
        case "until":
            guard let date = isoFormatter.date(from: val) else { return false }
            out.until = date
            return true
        case "min_likes", "minlikes":
            guard let n = Int(val), n >= 0, n <= 1_000_000 else { return false }
            out.minLikes = n
            return true
        case "min_replies", "minreplies":
            guard let n = Int(val), n >= 0, n <= 1_000_000 else { return false }
            out.minReplies = n
            return true
        default:
            return false
        }
    }

    private static func stripLeadingAt(_ word: String) -> String {
        word.hasPrefix("@") ? String(word.dropFirst()) : word
    }

    private static func matches(_ value: String, pattern: String) -> Bool {
        value.range(of: pattern, options: .regularExpression) != nil
    }

    static func isoDateString(_ date: Date) -> String {
        isoFormatter.string(from: date)
    }
}
