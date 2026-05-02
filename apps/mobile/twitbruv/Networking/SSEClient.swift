import Foundation
import os

struct SSEEvent: Sendable {
    var event: String
    var data: String
    var id: String?
}

actor SSEClient {
    private let log = Logger(subsystem: "app.twitbruv.ios", category: "sse")
    private let session: URLSession
    private let request: URLRequest
    private var task: Task<Void, Never>?

    init(session: URLSession, request: URLRequest) {
        self.session = session
        var req = request
        req.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        req.setValue("no-cache", forHTTPHeaderField: "Cache-Control")
        req.timeoutInterval = .infinity
        self.request = req
    }

    func events() -> AsyncStream<SSEEvent> {
        AsyncStream<SSEEvent> { continuation in
            let task = Task {
                var attempts = 0
                while !Task.isCancelled {
                    do {
                        try await self.runOnce(continuation: continuation)
                        attempts = 0
                    } catch is CancellationError {
                        break
                    } catch {
                        attempts += 1
                        let delaySec = min(30, Int(pow(2.0, Double(min(attempts, 5)))))
                        self.log.warning("sse reconnect in \(delaySec)s err=\(String(describing: error))")
                        try? await Task.sleep(for: .seconds(delaySec))
                    }
                }
                continuation.finish()
            }
            self.task = task
            continuation.onTermination = { @Sendable _ in
                task.cancel()
            }
        }
    }

    func cancel() {
        task?.cancel()
        task = nil
    }

    private func runOnce(continuation: AsyncStream<SSEEvent>.Continuation) async throws {
        let (bytes, response) = try await session.bytes(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw APIError.invalidResponse
        }
        var event = "message"
        var dataBuffer = ""
        var id: String?
        for try await line in bytes.lines {
            if Task.isCancelled { throw CancellationError() }
            if line.isEmpty {
                if !dataBuffer.isEmpty {
                    if dataBuffer.hasSuffix("\n") { dataBuffer.removeLast() }
                    continuation.yield(SSEEvent(event: event, data: dataBuffer, id: id))
                }
                event = "message"
                dataBuffer = ""
                id = nil
                continue
            }
            if line.hasPrefix(":") { continue }
            if let colonIdx = line.firstIndex(of: ":") {
                let field = String(line[..<colonIdx])
                var value = String(line[line.index(after: colonIdx)...])
                if value.hasPrefix(" ") { value.removeFirst() }
                switch field {
                case "event": event = value
                case "data":
                    dataBuffer += value
                    dataBuffer += "\n"
                case "id": id = value
                default: break
                }
            }
        }
    }
}
