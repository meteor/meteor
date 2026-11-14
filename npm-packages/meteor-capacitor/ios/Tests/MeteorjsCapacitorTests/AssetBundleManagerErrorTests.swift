import XCTest

@testable import MeteorjsCapacitor

final class AssetBundleManagerErrorTests: XCTestCase {

    private var versionsDir: URL!
    private var configuration: WebAppConfiguration!
    private var sessionConfig: URLSessionConfiguration!

    private let appId = "test-app-id"
    private let rootUrl = "http://mock.test"
    private let compatibility = "ios-1"
    private let basePath = "/__cordova"

    override func setUp() {
        super.setUp()

        versionsDir = FileManager.default.temporaryDirectory
            .appendingPathComponent("meteor-test-\(UUID().uuidString)")
        try! FileManager.default.createDirectory(at: versionsDir, withIntermediateDirectories: true)

        sessionConfig = URLSessionConfiguration.default
        sessionConfig.protocolClasses = [MockURLProtocol.self]

        let suiteName = "MeteorWebApp-Test-\(UUID().uuidString)"
        configuration = WebAppConfiguration(userDefaults: UserDefaults(suiteName: suiteName)!)
        configuration.reset()
        configuration.appId = appId
        configuration.rootURL = URL(string: rootUrl)
        configuration.cordovaCompatibilityVersion = compatibility

        MockURLProtocol.reset()
    }

    override func tearDown() {
        try? FileManager.default.removeItem(at: versionsDir)
        MockURLProtocol.reset()
        super.tearDown()
    }

    // MARK: - Helpers

    private func createInitialBundle() throws -> AssetBundle {
        let builder = TestBundleBuilder(
            version: "v-initial", appId: appId, rootUrl: rootUrl, compatibility: compatibility)
        let dir = versionsDir.appendingPathComponent("initial")
        try builder.writeManifestAndIndex(to: dir)
        return try AssetBundle(directoryURL: dir)
    }

    private var baseURL: URL {
        URL(string: "http://mock.test/__cordova/")!
    }

    /// Run a manager update expecting an error. Returns the error if one occurs.
    private func runExpectingError(
        routes: [String: MockURLProtocol.MockResponse],
        config: WebAppConfiguration? = nil
    ) throws -> Error? {
        MockURLProtocol.routes = routes

        let initial = try createInitialBundle()
        let cfg = config ?? configuration!
        let manager = AssetBundleManager(
            configuration: cfg,
            versionsDirectoryURL: versionsDir,
            initialAssetBundle: initial,
            sessionConfiguration: sessionConfig)

        let expectation = XCTestExpectation(description: "callback")
        var downloadedBundle: AssetBundle?
        var downloadError: Error?

        let delegate = TestManagerDelegate()
        delegate.shouldDownload = true
        delegate.onFinish = { bundle in
            downloadedBundle = bundle
            expectation.fulfill()
        }
        delegate.onError = { error in
            downloadError = error
            expectation.fulfill()
        }
        manager.delegate = delegate

        manager.checkForUpdatesWithBaseURL(baseURL)

        let result = XCTWaiter.wait(for: [expectation], timeout: 10)
        XCTAssertNotEqual(result, .timedOut, "Timed out waiting for callback")
        XCTAssertNil(downloadedBundle, "Should not have downloaded successfully")

        return downloadError
    }

    // MARK: - Error tests

    func testMissingAsset_callsOnError() throws {
        let version = "v-missing-asset"
        let builder = TestBundleBuilder(
            version: version, appId: appId, rootUrl: rootUrl, compatibility: compatibility)
            .addAsset("app/main.js", type: "js", content: "console.log('exists');")
            .addAsset("app/missing.js", type: "js", content: "// never served")

        let existsHash = builder.assets[0].hash

        // Serve everything except missing.js
        var routes: [String: MockURLProtocol.MockResponse] = [:]
        routes["\(basePath)/manifest.json"] = MockURLProtocol.MockResponse(
            statusCode: 200, body: builder.buildManifestJson())
        routes["\(basePath)/"] = MockURLProtocol.MockResponse(
            statusCode: 200, body: builder.buildIndexHtml())
        routes["\(basePath)/app/main.js"] = MockURLProtocol.MockResponse(
            statusCode: 200,
            headers: ["Etag": "\"\(existsHash)\""],
            body: "console.log('exists');")
        // missing.js → default 404

        let error = try runExpectingError(routes: routes)
        XCTAssertNotNil(error, "Should have received an error")
        let message = String(describing: error!)
        XCTAssertTrue(message.contains("Non-success status code") || message.contains("404"),
            "Error should mention non-success status: \(message)")
    }

    func testInvalidAssetHash_callsOnError() throws {
        let version = "v-bad-hash"
        let builder = TestBundleBuilder(
            version: version, appId: appId, rootUrl: rootUrl, compatibility: compatibility)
            .addAsset("app/main.js", type: "js", content: "console.log('hash test');")

        var routes = builder.buildRoutes(basePath: basePath)
        // Override with wrong hash
        routes["\(basePath)/app/main.js"] = MockURLProtocol.MockResponse(
            statusCode: 200,
            headers: ["Etag": "\"0000000000000000000000000000000000000000\""],
            body: "console.log('hash test');")

        let error = try runExpectingError(routes: routes)
        XCTAssertNotNil(error, "Should have received an error for hash mismatch")
        XCTAssertTrue(String(describing: error!).contains("Hash mismatch"),
            "Error should mention hash mismatch: \(error!)")
    }

    func testVersionMismatchInIndexPage_callsOnError() throws {
        let version = "v-version-mismatch"
        let builder = TestBundleBuilder(
            version: version, appId: appId, rootUrl: rootUrl, compatibility: compatibility)
            .addAsset("app/main.js", type: "js", content: "console.log('ver mismatch');")

        let wrongConfig = "{\"ROOT_URL\":\"\(rootUrl)\",\"appId\":\"\(appId)\",\"autoupdateVersionCordova\":\"v-WRONG\"}"
        let wrongIndexHtml = builder.buildIndexHtmlWithConfig(wrongConfig)
        let routes = builder.buildRoutesWithCustomIndexHtml(wrongIndexHtml, basePath: basePath)

        let error = try runExpectingError(routes: routes)
        XCTAssertNotNil(error, "Should have received an error for version mismatch")
        XCTAssertTrue(String(describing: error!).contains("Version mismatch"),
            "Error should mention version mismatch: \(error!)")
    }

    func testMissingRootUrlInIndexPage_callsOnError() throws {
        let version = "v-no-rooturl"
        let builder = TestBundleBuilder(
            version: version, appId: appId, rootUrl: rootUrl, compatibility: compatibility)
            .addAsset("app/main.js", type: "js", content: "console.log('no root');")

        let noRootConfig = "{\"appId\":\"\(appId)\",\"autoupdateVersionCordova\":\"\(version)\"}"
        let noRootIndexHtml = builder.buildIndexHtmlWithConfig(noRootConfig)
        let routes = builder.buildRoutesWithCustomIndexHtml(noRootIndexHtml, basePath: basePath)

        let error = try runExpectingError(routes: routes)
        XCTAssertNotNil(error, "Should have received an error for missing ROOT_URL")
        XCTAssertTrue(String(describing: error!).contains("ROOT_URL"),
            "Error should mention ROOT_URL: \(error!)")
    }

    func testRootUrlChangingToLocalhost_callsOnError() throws {
        let version = "v-localhost"
        let builder = TestBundleBuilder(
            version: version, appId: appId, rootUrl: rootUrl, compatibility: compatibility)
            .addAsset("app/main.js", type: "js", content: "console.log('localhost');")

        let localhostConfig = "{\"ROOT_URL\":\"http://localhost:3000\",\"appId\":\"\(appId)\",\"autoupdateVersionCordova\":\"\(version)\"}"
        let localhostIndexHtml = builder.buildIndexHtmlWithConfig(localhostConfig)
        let routes = builder.buildRoutesWithCustomIndexHtml(localhostIndexHtml, basePath: basePath)

        // Use a configuration with non-localhost ROOT_URL
        let suiteName = "MeteorWebApp-LocalhostTest-\(UUID().uuidString)"
        let localhostCfg = WebAppConfiguration(userDefaults: UserDefaults(suiteName: suiteName)!)
        localhostCfg.reset()
        localhostCfg.appId = appId
        localhostCfg.rootURL = URL(string: "http://example.com")
        localhostCfg.cordovaCompatibilityVersion = compatibility

        let error = try runExpectingError(routes: routes, config: localhostCfg)
        XCTAssertNotNil(error, "Should have received an error for localhost ROOT_URL change")
        XCTAssertTrue(String(describing: error!).contains("localhost"),
            "Error should mention localhost: \(error!)")
    }

    func testMissingAppIdInIndexPage_callsOnError() throws {
        let version = "v-no-appid"
        let builder = TestBundleBuilder(
            version: version, appId: appId, rootUrl: rootUrl, compatibility: compatibility)
            .addAsset("app/main.js", type: "js", content: "console.log('no appid');")

        let noAppIdConfig = "{\"ROOT_URL\":\"\(rootUrl)\",\"autoupdateVersionCordova\":\"\(version)\"}"
        let noAppIdIndexHtml = builder.buildIndexHtmlWithConfig(noAppIdConfig)
        let routes = builder.buildRoutesWithCustomIndexHtml(noAppIdIndexHtml, basePath: basePath)

        let error = try runExpectingError(routes: routes)
        XCTAssertNotNil(error, "Should have received an error for missing appId")
        XCTAssertTrue(String(describing: error!).contains("appId"),
            "Error should mention appId: \(error!)")
    }

    func testWrongAppId_callsOnError() throws {
        let version = "v-wrong-appid"
        let builder = TestBundleBuilder(
            version: version, appId: appId, rootUrl: rootUrl, compatibility: compatibility)
            .addAsset("app/main.js", type: "js", content: "console.log('wrong appid');")

        let wrongAppIdConfig = "{\"ROOT_URL\":\"\(rootUrl)\",\"appId\":\"wrong-app-id\",\"autoupdateVersionCordova\":\"\(version)\"}"
        let wrongAppIdIndexHtml = builder.buildIndexHtmlWithConfig(wrongAppIdConfig)
        let routes = builder.buildRoutesWithCustomIndexHtml(wrongAppIdIndexHtml, basePath: basePath)

        let error = try runExpectingError(routes: routes)
        XCTAssertNotNil(error, "Should have received an error for wrong appId")
        XCTAssertTrue(String(describing: error!).contains("appId"),
            "Error should mention appId: \(error!)")
    }

    func testManifestDownloadFailure_callsOnError() throws {
        // Server returns 500 for manifest
        let routes: [String: MockURLProtocol.MockResponse] = [
            "\(basePath)/manifest.json": MockURLProtocol.MockResponse(
                statusCode: 500, body: "Internal Server Error")
        ]

        let error = try runExpectingError(routes: routes)
        XCTAssertNotNil(error, "Should have received an error for manifest download failure")
        let message = String(describing: error!)
        XCTAssertTrue(message.contains("Non-success status code") || message.contains("500"),
            "Error should mention non-success status: \(message)")
    }

    func testMissingSourceMap_doesNotFail() throws {
        let version = "v-missing-map"
        let builder = TestBundleBuilder(
            version: version, appId: appId, rootUrl: rootUrl, compatibility: compatibility)
            .addAssetWithSourceMap("app/main.js", type: "js",
                content: "console.log('sourcemap test');", sourceMapPath: "app/main.js.map")

        let mainHash = builder.assets[0].hash

        // Serve everything except the source map (which returns 404 by default)
        var routes: [String: MockURLProtocol.MockResponse] = [:]
        routes["\(basePath)/manifest.json"] = MockURLProtocol.MockResponse(
            statusCode: 200, body: builder.buildManifestJson())
        routes["\(basePath)/"] = MockURLProtocol.MockResponse(
            statusCode: 200, body: builder.buildIndexHtml())
        routes["\(basePath)/app/main.js"] = MockURLProtocol.MockResponse(
            statusCode: 200,
            headers: ["Etag": "\"\(mainHash)\""],
            body: "console.log('sourcemap test');")
        // Source map → default 404 (not in routes)

        MockURLProtocol.routes = routes

        let initial = try createInitialBundle()
        let manager = AssetBundleManager(
            configuration: configuration,
            versionsDirectoryURL: versionsDir,
            initialAssetBundle: initial,
            sessionConfiguration: sessionConfig)

        let expectation = XCTestExpectation(description: "callback")
        var downloadedBundle: AssetBundle?
        var downloadError: Error?

        let delegate = TestManagerDelegate()
        delegate.shouldDownload = true
        delegate.onFinish = { bundle in
            downloadedBundle = bundle
            expectation.fulfill()
        }
        delegate.onError = { error in
            downloadError = error
            expectation.fulfill()
        }
        manager.delegate = delegate

        manager.checkForUpdatesWithBaseURL(baseURL)

        wait(for: [expectation], timeout: 10)

        XCTAssertNil(downloadError,
            "Missing source map should NOT cause an error: \(String(describing: downloadError))")
        XCTAssertNotNil(downloadedBundle, "Download should succeed despite missing source map")
        XCTAssertEqual(downloadedBundle?.version, version)
    }
}
