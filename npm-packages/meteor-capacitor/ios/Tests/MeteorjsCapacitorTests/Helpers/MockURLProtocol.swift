import Foundation

/// URLProtocol subclass that intercepts network requests in tests.
/// Register via `URLSessionConfiguration.protocolClasses = [MockURLProtocol.self]`.
final class MockURLProtocol: URLProtocol {

    struct MockResponse {
        let statusCode: Int
        let headers: [String: String]
        let body: Data
        let delay: TimeInterval

        init(statusCode: Int, headers: [String: String] = [:], body: Data = Data(), delay: TimeInterval = 0) {
            self.statusCode = statusCode
            self.headers = headers
            self.body = body
            self.delay = delay
        }

        init(statusCode: Int, headers: [String: String] = [:], body: String, delay: TimeInterval = 0) {
            self.statusCode = statusCode
            self.headers = headers
            self.body = body.data(using: .utf8) ?? Data()
            self.delay = delay
        }
    }

    // MARK: - Thread-safe state

    private static let lock = NSLock()
    private static var _routes: [String: MockResponse] = [:]
    private static var _requestedPaths: [String] = []

    static var routes: [String: MockResponse] {
        get { lock.withLock { _routes } }
        set { lock.withLock { _routes = newValue } }
    }

    static var requestedPaths: [String] {
        lock.withLock { _requestedPaths }
    }

    static func reset() {
        lock.withLock {
            _routes = [:]
            _requestedPaths = []
        }
    }

    private static func recordRequest(_ path: String) {
        lock.withLock { _requestedPaths.append(path) }
    }

    // MARK: - URLProtocol overrides

    private var cancelled = false

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        let path = request.url?.path ?? ""

        Self.recordRequest(path)

        let mockResponse: MockResponse
        if let response = Self.routes[path] {
            mockResponse = response
        } else if !path.hasSuffix("/"), let response = Self.routes[path + "/"] {
            // Trailing-slash fallback: Foundation URL.path may strip the
            // trailing slash depending on the OS version, so try matching
            // with a trailing slash appended.
            mockResponse = response
        } else {
            mockResponse = MockResponse(statusCode: 404)
        }

        let httpResponse = HTTPURLResponse(
            url: request.url!,
            statusCode: mockResponse.statusCode,
            httpVersion: "HTTP/1.1",
            headerFields: mockResponse.headers
        )!

        let body = mockResponse.body
        let delay = mockResponse.delay

        // Deliver response header first, then body asynchronously.
        // The async dispatch gives URLSession time to process the response
        // disposition (e.g. .becomeDownload) before data arrives.
        client?.urlProtocol(self, didReceive: httpResponse, cacheStoragePolicy: .notAllowed)

        let work = { [weak self] in
            guard let self = self, !self.cancelled else { return }
            self.client?.urlProtocol(self, didLoad: body)
            self.client?.urlProtocolDidFinishLoading(self)
        }

        if delay > 0 {
            DispatchQueue.global(qos: .default).asyncAfter(deadline: .now() + delay, execute: work)
        } else {
            DispatchQueue.global(qos: .default).async(execute: work)
        }
    }

    override func stopLoading() {
        cancelled = true
    }
}
