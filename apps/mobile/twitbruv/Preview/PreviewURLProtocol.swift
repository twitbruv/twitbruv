import Foundation

#if DEBUG
final class PreviewURLProtocol: URLProtocol {
    override class func canInit(with request: URLRequest) -> Bool {
        true
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest {
        request
    }

    override func stopLoading() {}

    override func startLoading() {
        let respond = PreviewHTTP.dispatch(request)
        let status = respond.0
        let data = respond.1
        guard let url = request.url else {
            client?.urlProtocolDidFinishLoading(self)
            return
        }
        let headers = ["Content-Type": "application/json"]
        let response = HTTPURLResponse(
            url: url,
            statusCode: status,
            httpVersion: "HTTP/1.1",
            headerFields: headers
        )!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: data)
        client?.urlProtocolDidFinishLoading(self)
    }
}
#else
enum PreviewURLProtocolUnavailable {}
#endif
