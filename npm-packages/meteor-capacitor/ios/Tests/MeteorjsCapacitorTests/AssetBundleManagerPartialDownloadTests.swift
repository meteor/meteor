import XCTest

@testable import MeteorjsCapacitor

final class AssetBundleManagerPartialDownloadTests: XCTestCase {

    private var rootDir: URL!
    private var versionsDir: URL!
    private var initialDir: URL!
    private var configuration: WebAppConfiguration!
    private var sessionConfig: URLSessionConfiguration!

    private let appId = "test-app-id"
    private let rootUrl = "http://mock.test"
    private let compatibility = "ios-1"
    private let basePath = "/__cordova"

    override func setUp() {
        super.setUp()

        rootDir = FileManager.default.temporaryDirectory
            .appendingPathComponent("meteor-partial-\(UUID().uuidString)")
        versionsDir = rootDir.appendingPathComponent("versions")
        initialDir = rootDir.appendingPathComponent("initial")
        try! FileManager.default.createDirectory(at: versionsDir, withIntermediateDirectories: true)
        try! FileManager.default.createDirectory(at: initialDir, withIntermediateDirectories: true)

        let suiteName = "MeteorWebApp-Partial-\(UUID().uuidString)"
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

    private func createInitialBundle() throws -> AssetBundle {
        let builder = TestBundleBuilder(
            version: "v-initial", appId: appId, rootUrl: rootUrl, compatibility: compatibility)
            .addAsset("app/bootstrap.js", type: "js", content: "console.log('initial');")
        try builder.writeToDirectory(initialDir)
        return try AssetBundle(directoryURL: initialDir)
    }

    private func createManager(initial: AssetBundle) -> AssetBundleManager {
        AssetBundleManager(
            configuration: configuration,
            versionsDirectoryURL: versionsDir,
            initialAssetBundle: initial,
            sessionConfiguration: sessionConfig)
    }

    private var baseURL: URL {
        URL(string: "http://mock.test/__cordova/")!
    }

    private func nonManifestAssetRequests() -> [String] {
        MockURLProtocol.requestedPaths.filter {
            $0 != "\(basePath)/manifest.json" && $0 != "\(basePath)/" && $0 != basePath
        }
    }

    func testInterruptedDownload_sameVersion_reusesAssetsFromPartialDirectory() throws {
        let version = "v-partial-resume"
        let builder = TestBundleBuilder(
            version: version, appId: appId, rootUrl: rootUrl, compatibility: compatibility)
            .addAsset("app/main.js", type: "js", content: "console.log('main');")
            .addAsset("app/extra.js", type: "js", content: "console.log('extra');")

        let downloadingDir = versionsDir.appendingPathComponent("Downloading")
        try builder.writeToDirectory(downloadingDir)
        try FileManager.default.removeItem(at: downloadingDir.appendingPathComponent("app/extra.js"))

        MockURLProtocol.routes = builder.buildRoutes(basePath: basePath)

        let initial = try createInitialBundle()
        let manager = createManager(initial: initial)
        let delegate = TestManagerDelegate()
        delegate.shouldDownload = true
        manager.delegate = delegate

        let done = expectation(description: "download finished")
        var failure: Error?
        var downloadedBundle: AssetBundle?
        delegate.onFinish = { bundle in
            downloadedBundle = bundle
            done.fulfill()
        }
        delegate.onError = { error in
            failure = error
            done.fulfill()
        }

        manager.checkForUpdatesWithBaseURL(baseURL)
        wait(for: [done], timeout: 10)

        XCTAssertNil(failure, "Unexpected error: \(String(describing: failure))")
        XCTAssertEqual(downloadedBundle?.version, version)

        let requests = nonManifestAssetRequests()
        XCTAssertFalse(
            requests.contains("\(basePath)/app/main.js"),
            "main.js should be reused from partial download")
        XCTAssertTrue(
            requests.contains("\(basePath)/app/extra.js"),
            "extra.js should be downloaded because it was missing")

        XCTAssertTrue(
            FileManager.default.fileExists(
                atPath: versionsDir.appendingPathComponent(version).path),
            "Version directory should exist after successful resume")
        XCTAssertTrue(
            FileManager.default.fileExists(
                atPath: versionsDir.appendingPathComponent("PartialDownload").path),
            "PartialDownload directory should be present after move/reuse")
    }

    func testInterruptedDownload_differentVersion_reusesMatchingAssetsFromPartialDirectory() throws {
        let v1 = "v-partial-1"
        let v2 = "v-partial-2"
        let sharedContent = "/* shared across versions */"

        let v1Builder = TestBundleBuilder(
            version: v1, appId: appId, rootUrl: rootUrl, compatibility: compatibility)
            .addAsset("app/shared.js", type: "js", content: sharedContent)
            .addAsset("app/v1only.js", type: "js", content: "console.log('v1-only');")

        let downloadingDir = versionsDir.appendingPathComponent("Downloading")
        try v1Builder.writeToDirectory(downloadingDir)
        try FileManager.default.removeItem(at: downloadingDir.appendingPathComponent("app/v1only.js"))

        let v2Builder = TestBundleBuilder(
            version: v2, appId: appId, rootUrl: rootUrl, compatibility: compatibility)
            .addAsset("app/shared.js", type: "js", content: sharedContent)
            .addAsset("app/v2only.js", type: "js", content: "console.log('v2-only');")
        MockURLProtocol.routes = v2Builder.buildRoutes(basePath: basePath)

        let initial = try createInitialBundle()
        let manager = createManager(initial: initial)
        let delegate = TestManagerDelegate()
        delegate.shouldDownload = true
        manager.delegate = delegate

        let done = expectation(description: "download finished")
        var failure: Error?
        var downloadedBundle: AssetBundle?
        delegate.onFinish = { bundle in
            downloadedBundle = bundle
            done.fulfill()
        }
        delegate.onError = { error in
            failure = error
            done.fulfill()
        }

        manager.checkForUpdatesWithBaseURL(baseURL)
        wait(for: [done], timeout: 10)

        XCTAssertNil(failure, "Unexpected error: \(String(describing: failure))")
        XCTAssertEqual(downloadedBundle?.version, v2)

        let requests = nonManifestAssetRequests()
        XCTAssertFalse(
            requests.contains("\(basePath)/app/shared.js"),
            "shared.js should be reused from partial download")
        XCTAssertTrue(
            requests.contains("\(basePath)/app/v2only.js"),
            "v2only.js should be downloaded as a new asset")
    }
}
