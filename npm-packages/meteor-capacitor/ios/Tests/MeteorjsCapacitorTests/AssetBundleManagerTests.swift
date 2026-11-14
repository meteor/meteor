import XCTest

@testable import MeteorjsCapacitor

final class AssetBundleManagerTests: XCTestCase {

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

    private func createInitialBundle(version: String = "v-initial") throws -> AssetBundle {
        let builder = TestBundleBuilder(
            version: version, appId: appId, rootUrl: rootUrl, compatibility: compatibility)
        let dir = versionsDir.appendingPathComponent("initial")
        try builder.writeManifestAndIndex(to: dir)
        return try AssetBundle(directoryURL: dir)
    }

    private func createManager(initial: AssetBundle) -> AssetBundleManager {
        return AssetBundleManager(
            configuration: configuration,
            versionsDirectoryURL: versionsDir,
            initialAssetBundle: initial,
            sessionConfiguration: sessionConfig)
    }

    private var baseURL: URL {
        URL(string: "http://mock.test/__cordova/")!
    }

    // MARK: - Tests

    func testDownloadNewVersion_storesBundleAndNotifies() throws {
        let newVersion = "v-new-1"

        let serverBuilder = TestBundleBuilder(
            version: newVersion, appId: appId, rootUrl: rootUrl, compatibility: compatibility)
            .addAsset("app/main.js", type: "js", content: "console.log('v1');")
            .addAsset("app/style.css", type: "css", content: "body{}")
        MockURLProtocol.routes = serverBuilder.buildRoutes(basePath: basePath)

        let initial = try createInitialBundle()
        let manager = createManager(initial: initial)

        let expectation = XCTestExpectation(description: "download complete")
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

        XCTAssertNil(downloadError, "Unexpected error: \(String(describing: downloadError))")
        XCTAssertNotNil(downloadedBundle)
        XCTAssertEqual(downloadedBundle?.version, newVersion)

        // Verify asset files exist on disk
        let mainJs = versionsDir.appendingPathComponent("\(newVersion)/app/main.js")
        XCTAssertTrue(FileManager.default.fileExists(atPath: mainJs.path),
            "Downloaded asset should exist on disk")

        let styleCss = versionsDir.appendingPathComponent("\(newVersion)/app/style.css")
        XCTAssertTrue(FileManager.default.fileExists(atPath: styleCss.path),
            "Downloaded asset should exist on disk")
    }

    func testSameVersionAsInitial_notifiesWithInitialBundle() throws {
        let version = "v-same-initial"

        let serverBuilder = TestBundleBuilder(
            version: version, appId: appId, rootUrl: rootUrl, compatibility: compatibility)
            .addAsset("app/main.js", type: "js", content: "console.log('same');")
        MockURLProtocol.routes = serverBuilder.buildRoutes(basePath: basePath)

        let initial = try createInitialBundle(version: version)
        let manager = createManager(initial: initial)

        let expectation = XCTestExpectation(description: "notified with initial")
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

        XCTAssertNil(downloadError, "Unexpected error: \(String(describing: downloadError))")
        XCTAssertNotNil(downloadedBundle)
        XCTAssertTrue(downloadedBundle === initial,
            "Should return the initial bundle instance (same object)")
    }

    func testSameVersionAlreadyDownloaded_notifiesWithExistingBundle() throws {
        let version = "v-already-dl"

        let serverBuilder = TestBundleBuilder(
            version: version, appId: appId, rootUrl: rootUrl, compatibility: compatibility)
            .addAsset("app/main.js", type: "js", content: "console.log('already');")
        MockURLProtocol.routes = serverBuilder.buildRoutes(basePath: basePath)

        let initial = try createInitialBundle()
        let manager = createManager(initial: initial)
        let delegate = TestManagerDelegate()
        delegate.shouldDownload = true
        manager.delegate = delegate

        // First download
        let expect1 = XCTestExpectation(description: "first download")
        var firstBundle: AssetBundle?
        var failure1: Error?
        delegate.onFinish = { bundle in firstBundle = bundle; expect1.fulfill() }
        delegate.onError = { error in failure1 = error; expect1.fulfill() }

        manager.checkForUpdatesWithBaseURL(baseURL)
        wait(for: [expect1], timeout: 10)
        XCTAssertNil(failure1, "First download failed: \(String(describing: failure1))")
        XCTAssertNotNil(firstBundle)

        let requestCountAfterFirst = MockURLProtocol.requestedPaths.count

        // Second check — same version already downloaded
        let expect2 = XCTestExpectation(description: "second check")
        var secondBundle: AssetBundle?
        var failure2: Error?
        delegate.onFinish = { bundle in secondBundle = bundle; expect2.fulfill() }
        delegate.onError = { error in failure2 = error; expect2.fulfill() }

        manager.checkForUpdatesWithBaseURL(baseURL)
        wait(for: [expect2], timeout: 10)
        XCTAssertNil(failure2, "Second check failed: \(String(describing: failure2))")
        XCTAssertNotNil(secondBundle)
        XCTAssertEqual(secondBundle?.version, version)

        // Only the manifest request should have been made (no asset downloads)
        let requestCountAfterSecond = MockURLProtocol.requestedPaths.count
        XCTAssertEqual(requestCountAfterSecond, requestCountAfterFirst + 1,
            "Should only fetch manifest on second check")
    }

    func testDownloadSecondVersion_onlyDownloadsChangedAssets() throws {
        let v1 = "v-change-1"
        let v2 = "v-change-2"
        let sharedContent = "/* shared content */"

        // v1 on server
        let v1Builder = TestBundleBuilder(
            version: v1, appId: appId, rootUrl: rootUrl, compatibility: compatibility)
            .addAsset("app/shared.js", type: "js", content: sharedContent)
            .addAsset("app/changed.js", type: "js", content: "// v1 content")
        MockURLProtocol.routes = v1Builder.buildRoutes(basePath: basePath)

        let initial = try createInitialBundle()
        let manager = createManager(initial: initial)
        let delegate = TestManagerDelegate()
        delegate.shouldDownload = true
        manager.delegate = delegate

        // Download v1
        let expect1 = XCTestExpectation(description: "v1 download")
        var failure1: Error?
        delegate.onFinish = { _ in expect1.fulfill() }
        delegate.onError = { error in failure1 = error; expect1.fulfill() }

        manager.checkForUpdatesWithBaseURL(baseURL)
        wait(for: [expect1], timeout: 10)
        XCTAssertNil(failure1, "v1 error: \(String(describing: failure1))")

        // Now set up v2 with tracking
        let v2Builder = TestBundleBuilder(
            version: v2, appId: appId, rootUrl: rootUrl, compatibility: compatibility)
            .addAsset("app/shared.js", type: "js", content: sharedContent)
            .addAsset("app/changed.js", type: "js", content: "// v2 content")

        MockURLProtocol.reset()
        MockURLProtocol.routes = v2Builder.buildRoutes(basePath: basePath)

        // Download v2
        let expect2 = XCTestExpectation(description: "v2 download")
        var failure2: Error?
        delegate.onFinish = { _ in expect2.fulfill() }
        delegate.onError = { error in failure2 = error; expect2.fulfill() }

        manager.checkForUpdatesWithBaseURL(baseURL)
        wait(for: [expect2], timeout: 10)
        XCTAssertNil(failure2, "v2 error: \(String(describing: failure2))")

        // shared.js has the same hash, so it should NOT have been downloaded
        let assetRequests = MockURLProtocol.requestedPaths.filter {
            $0 != "\(basePath)/manifest.json" && $0 != "\(basePath)/"
        }
        XCTAssertFalse(assetRequests.contains("\(basePath)/app/shared.js"),
            "shared.js should not be downloaded (cached from v1)")
        XCTAssertTrue(assetRequests.contains("\(basePath)/app/changed.js"),
            "changed.js should be downloaded (new content)")
    }

    func testDownloadSecondVersion_cachedAssetsStillAccessible() throws {
        let v1 = "v-cached-1"
        let v2 = "v-cached-2"
        let sharedContent = "/* shared asset for cache test */"

        let v1Builder = TestBundleBuilder(
            version: v1, appId: appId, rootUrl: rootUrl, compatibility: compatibility)
            .addAsset("app/shared.js", type: "js", content: sharedContent)
            .addAsset("app/v1only.js", type: "js", content: "// v1 only")
        MockURLProtocol.routes = v1Builder.buildRoutes(basePath: basePath)

        let initial = try createInitialBundle()
        let manager = createManager(initial: initial)
        let delegate = TestManagerDelegate()
        delegate.shouldDownload = true
        manager.delegate = delegate

        // Download v1
        let expect1 = XCTestExpectation(description: "v1 download")
        var failure: Error?
        delegate.onFinish = { _ in expect1.fulfill() }
        delegate.onError = { error in failure = error; expect1.fulfill() }

        manager.checkForUpdatesWithBaseURL(baseURL)
        wait(for: [expect1], timeout: 10)
        XCTAssertNil(failure, "v1 error: \(String(describing: failure))")

        // v2
        let v2Builder = TestBundleBuilder(
            version: v2, appId: appId, rootUrl: rootUrl, compatibility: compatibility)
            .addAsset("app/shared.js", type: "js", content: sharedContent)
            .addAsset("app/v2only.js", type: "js", content: "// v2 only")
        MockURLProtocol.routes = v2Builder.buildRoutes(basePath: basePath)

        let expect2 = XCTestExpectation(description: "v2 download")
        var v2Bundle: AssetBundle?
        failure = nil
        delegate.onFinish = { bundle in v2Bundle = bundle; expect2.fulfill() }
        delegate.onError = { error in failure = error; expect2.fulfill() }

        manager.checkForUpdatesWithBaseURL(baseURL)
        wait(for: [expect2], timeout: 10)
        XCTAssertNil(failure, "v2 error: \(String(describing: failure))")
        XCTAssertNotNil(v2Bundle)

        // v2 should resolve shared.js via parent chain or cache
        let sharedAsset = v2Bundle?.assetForURLPath("/app/shared.js")
        XCTAssertNotNil(sharedAsset,
            "shared.js should be accessible in v2 bundle (via parent chain or copy)")
    }

    func testSameVersionOnServer_callbackNotInvoked() throws {
        let version = "v-no-update"

        let serverBuilder = TestBundleBuilder(
            version: version, appId: appId, rootUrl: rootUrl, compatibility: compatibility)
            .addAsset("app/main.js", type: "js", content: "console.log('no update');")

        // Only serve the manifest
        MockURLProtocol.routes = [
            "\(basePath)/manifest.json": MockURLProtocol.MockResponse(
                statusCode: 200, body: serverBuilder.buildManifestJson())
        ]

        let initial = try createInitialBundle()
        let manager = createManager(initial: initial)

        let expectation = XCTestExpectation(description: "callback invoked")
        expectation.isInverted = true  // We expect this NOT to be fulfilled

        let delegate = TestManagerDelegate()
        delegate.shouldDownload = false  // Reject the download
        delegate.onFinish = { _ in expectation.fulfill() }
        delegate.onError = { _ in expectation.fulfill() }
        manager.delegate = delegate

        manager.checkForUpdatesWithBaseURL(baseURL)

        // Wait briefly — neither callback should fire
        wait(for: [expectation], timeout: 3)
    }

    func testAlreadyDownloadingSameVersion_doesNotRestartDownload() throws {
        let version = "v-dedup"

        let serverBuilder = TestBundleBuilder(
            version: version, appId: appId, rootUrl: rootUrl, compatibility: compatibility)
            .addAsset("app/main.js", type: "js", content: "console.log('dedup');")

        // Use a delay on the asset to create a window for the second call
        var routes = serverBuilder.buildRoutes(basePath: basePath)
        let hash = serverBuilder.assets[0].hash
        routes["\(basePath)/app/main.js"] = MockURLProtocol.MockResponse(
            statusCode: 200,
            headers: ["Etag": "\"\(hash)\""],
            body: "console.log('dedup');",
            delay: 0.5)
        MockURLProtocol.routes = routes

        let initial = try createInitialBundle()
        let manager = createManager(initial: initial)

        let expectation = XCTestExpectation(description: "download complete")
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

        // Fire two checks rapidly — second should be a no-op
        manager.checkForUpdatesWithBaseURL(baseURL)
        manager.checkForUpdatesWithBaseURL(baseURL)

        wait(for: [expectation], timeout: 10)

        XCTAssertNil(downloadError, "Unexpected error: \(String(describing: downloadError))")
        XCTAssertNotNil(downloadedBundle)
        XCTAssertEqual(downloadedBundle?.version, version)
    }
}
