import WebKit
import XCTest

@testable import MeteorjsCapacitor

@available(iOS 13.0, *)
final class CapacitorMeteorWebAppLifecycleTests: XCTestCase {

    private var rootDir: URL!
    private var versionsDir: URL!
    private var servingDir: URL!
    private var initialDir: URL!
    private var configuration: WebAppConfiguration!
    private var sessionConfig: URLSessionConfiguration!

    private let appId = "test-app-id"
    private let rootUrl = "http://mock.test"
    private let compatibility = "ios-1"

    override func setUp() {
        super.setUp()

        rootDir = FileManager.default.temporaryDirectory
            .appendingPathComponent("meteor-app-lifecycle-\(UUID().uuidString)")
        versionsDir = rootDir.appendingPathComponent("versions")
        servingDir = rootDir.appendingPathComponent("serving")
        initialDir = rootDir.appendingPathComponent("initial")

        try! FileManager.default.createDirectory(at: versionsDir, withIntermediateDirectories: true)
        try! FileManager.default.createDirectory(at: servingDir, withIntermediateDirectories: true)
        try! FileManager.default.createDirectory(at: initialDir, withIntermediateDirectories: true)

        let suiteName = "MeteorWebApp-Lifecycle-\(UUID().uuidString)"
        configuration = WebAppConfiguration(userDefaults: UserDefaults(suiteName: suiteName)!)
        configuration.reset()
        configuration.appId = appId
        configuration.rootURL = URL(string: rootUrl)
        configuration.cordovaCompatibilityVersion = compatibility

        sessionConfig = URLSessionConfiguration.default
        sessionConfig.protocolClasses = [MockURLProtocol.self]
        MockURLProtocol.reset()
    }

    override func tearDown() {
        try? FileManager.default.removeItem(at: rootDir)
        MockURLProtocol.reset()
        super.tearDown()
    }

    private func createBundle(
        version: String,
        directory: URL,
        parent: AssetBundle? = nil
    ) throws -> AssetBundle {
        let builder = TestBundleBuilder(
            version: version, appId: appId, rootUrl: rootUrl, compatibility: compatibility)
            .addAsset("app/main.js", type: "js", content: "console.log('\(version)');")
        try builder.writeToDirectory(directory)
        return try AssetBundle(directoryURL: directory, parentAssetBundle: parent)
    }

    private func createManager(initial: AssetBundle) -> AssetBundleManager {
        AssetBundleManager(
            configuration: configuration,
            versionsDirectoryURL: versionsDir,
            initialAssetBundle: initial,
            sessionConfiguration: sessionConfig)
    }

    private func assertEventually(
        _ message: String,
        timeout: TimeInterval = 5.0,
        file: StaticString = #filePath,
        line: UInt = #line,
        condition: @escaping () -> Bool
    ) {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if condition() {
                return
            }
            RunLoop.current.run(mode: .default, before: Date().addingTimeInterval(0.02))
        }
        XCTFail(message, file: file, line: line)
    }

    func testStartupDidComplete_marksCurrentAsGoodAndCleansOlderVersions() throws {
        let v1 = "v-cleanup-1"
        let v2 = "v-cleanup-2"

        let initial = try createBundle(version: "v-initial", directory: initialDir)
        _ = try createBundle(version: v1, directory: versionsDir.appendingPathComponent(v1), parent: initial)
        _ = try createBundle(version: v2, directory: versionsDir.appendingPathComponent(v2), parent: initial)

        let manager = createManager(initial: initial)
        let current = try XCTUnwrap(manager.downloadedAssetBundleWithVersion(v2))
        let app = CapacitorMeteorWebApp(
            capacitorBridge: nil,
            configuration: configuration,
            assetBundleManager: manager,
            currentAssetBundle: current,
            servingDirectoryURL: servingDir)

        let callback = expectation(description: "startup callback")
        var callbackError: Error?
        app.startupDidComplete { error in
            callbackError = error
            callback.fulfill()
        }
        wait(for: [callback], timeout: 5)

        XCTAssertNil(callbackError)
        XCTAssertEqual(configuration.lastKnownGoodVersion, v2)

        let v1Dir = versionsDir.appendingPathComponent(v1)
        let v2Dir = versionsDir.appendingPathComponent(v2)
        assertEventually("Expected older bundle to be removed and current bundle retained") {
            !FileManager.default.fileExists(atPath: v1Dir.path)
                && FileManager.default.fileExists(atPath: v2Dir.path)
        }
    }

    func testDidFinishDownloadingBundle_setsPendingAndPostsUpdateAvailable() throws {
        let pendingVersion = "v-pending"

        let initial = try createBundle(version: "v-initial", directory: initialDir)
        let manager = createManager(initial: initial)
        let app = CapacitorMeteorWebApp(
            capacitorBridge: nil,
            configuration: configuration,
            assetBundleManager: manager,
            currentAssetBundle: initial,
            servingDirectoryURL: servingDir)

        let pendingBundle = try createBundle(
            version: pendingVersion,
            directory: versionsDir.appendingPathComponent(pendingVersion),
            parent: initial)

        let notification = expectation(forNotification: .meteorWebappUpdateAvailable, object: nil) {
            note in
            let version = note.userInfo?["version"] as? String
            return version == pendingVersion
        }

        app.assetBundleManager(manager, didFinishDownloadingBundle: pendingBundle)
        wait(for: [notification], timeout: 3)

        XCTAssertEqual(configuration.lastDownloadedVersion, pendingVersion)
        XCTAssertTrue(app.isUpdateAvailable())
    }

    func testReload_switchesToPendingVersionAndUpdatesServingPath() throws {
        let pendingVersion = "v-reload"

        let initial = try createBundle(version: "v-initial", directory: initialDir)
        let manager = createManager(initial: initial)
        let bridge = TestCapacitorBridge()
        let app = CapacitorMeteorWebApp(
            capacitorBridge: bridge,
            configuration: configuration,
            assetBundleManager: manager,
            currentAssetBundle: initial,
            servingDirectoryURL: servingDir)

        let pendingBundle = try createBundle(
            version: pendingVersion,
            directory: versionsDir.appendingPathComponent(pendingVersion),
            parent: initial)
        app.assetBundleManager(manager, didFinishDownloadingBundle: pendingBundle)
        XCTAssertTrue(app.isUpdateAvailable())

        let reloadDone = expectation(description: "reload callback")
        var reloadError: Error?
        app.reload { error in
            reloadError = error
            reloadDone.fulfill()
        }
        wait(for: [reloadDone], timeout: 10)

        XCTAssertNil(reloadError)
        XCTAssertEqual(app.getCurrentVersion(), pendingVersion)
        XCTAssertFalse(app.isUpdateAvailable())

        let servingVersionDir = servingDir.appendingPathComponent(pendingVersion)
        XCTAssertTrue(FileManager.default.fileExists(atPath: servingVersionDir.path))
        XCTAssertEqual(bridge.reloadCount, 1)
        XCTAssertEqual(bridge.serverBasePaths.last, servingVersionDir.path)
    }

    func testStartupTimer_pausesInBackgroundAndResumesOnForeground() throws {
        let goodVersion = "v-good-bg"
        let badVersion = "v-bad-bg"

        let initial = try createBundle(version: goodVersion, directory: initialDir)
        let manager = createManager(initial: initial)
        let bridge = TestCapacitorBridge()
        let app = CapacitorMeteorWebApp(
            capacitorBridge: bridge,
            configuration: configuration,
            assetBundleManager: manager,
            currentAssetBundle: initial,
            servingDirectoryURL: servingDir,
            startupTimeoutInterval: 0.2)

        configuration.lastKnownGoodVersion = goodVersion

        let badBundle = try createBundle(
            version: badVersion,
            directory: versionsDir.appendingPathComponent(badVersion),
            parent: initial)
        app.assetBundleManager(manager, didFinishDownloadingBundle: badBundle)
        XCTAssertTrue(app.isUpdateAvailable())

        let reloadDone = expectation(description: "reload callback")
        var reloadError: Error?
        app.reload { error in
            reloadError = error
            reloadDone.fulfill()
        }
        wait(for: [reloadDone], timeout: 5)

        XCTAssertNil(reloadError)
        XCTAssertEqual(app.getCurrentVersion(), badVersion)

        // Pause startup timer and wait longer than timeout while backgrounded.
        app.onApplicationDidEnterBackground()
        RunLoop.current.run(until: Date().addingTimeInterval(0.35))
        XCTAssertEqual(
            app.getCurrentVersion(), badVersion,
            "Version should not be reverted while startup timer is paused in background")

        // Resume timer; app should revert after remaining interval elapses.
        app.onApplicationWillEnterForeground()

        assertEventually("Expected app to revert to good version after foreground resume") {
            app.getCurrentVersion() == goodVersion
        }
        assertEventually("Expected second reload after revert") {
            bridge.reloadCount >= 2
        }
        XCTAssertTrue(configuration.versionsToRetry.contains(badVersion))
    }

    func testStartupTimeout_revertsToLastKnownGoodVersionAndMarksRetry() throws {
        let goodVersion = "v-good"
        let badVersion = "v-bad"

        let initial = try createBundle(version: "v-initial", directory: initialDir)
        _ = try createBundle(
            version: goodVersion,
            directory: versionsDir.appendingPathComponent(goodVersion),
            parent: initial)
        _ = try createBundle(
            version: badVersion,
            directory: versionsDir.appendingPathComponent(badVersion),
            parent: initial)

        let manager = createManager(initial: initial)
        let badBundle = try XCTUnwrap(manager.downloadedAssetBundleWithVersion(badVersion))
        configuration.lastKnownGoodVersion = goodVersion

        let bridge = TestCapacitorBridge()
        let app = CapacitorMeteorWebApp(
            capacitorBridge: bridge,
            configuration: configuration,
            assetBundleManager: manager,
            currentAssetBundle: badBundle,
            servingDirectoryURL: servingDir)

        app.triggerStartupTimeoutForTesting()

        assertEventually("Expected app to revert to last known good version") {
            app.getCurrentVersion() == goodVersion
        }
        assertEventually("Expected bridge reload to be triggered") {
            bridge.reloadCount == 1
        }
        XCTAssertTrue(configuration.versionsToRetry.contains(badVersion))
        XCTAssertFalse(app.isUpdateAvailable())

        let servingGoodDir = servingDir.appendingPathComponent(goodVersion)
        assertEventually("Expected good version to be organized for serving") {
            FileManager.default.fileExists(atPath: servingGoodDir.path)
        }
    }
}

@available(iOS 13.0, *)
private final class TestCapacitorBridge: CapacitorBridge {
    private(set) var serverBasePaths: [String] = []
    private(set) var reloadCount = 0
    var webView: WKWebView? = nil

    func setServerBasePath(_ path: String) {
        serverBasePaths.append(path)
    }

    func getWebView() -> AnyObject? {
        webView
    }

    func reload() {
        reloadCount += 1
    }
}
