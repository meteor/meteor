import XCTest

@testable import MeteorjsCapacitor

final class AssetBundleManagerCleanupTests: XCTestCase {

    private var rootDir: URL!
    private var versionsDir: URL!
    private var initialDir: URL!
    private var configuration: WebAppConfiguration!
    private var sessionConfig: URLSessionConfiguration!

    private let appId = "test-app-id"
    private let rootUrl = "http://mock.test"
    private let compatibility = "ios-1"

    override func setUp() {
        super.setUp()

        rootDir = FileManager.default.temporaryDirectory
            .appendingPathComponent("meteor-cleanup-\(UUID().uuidString)")
        versionsDir = rootDir.appendingPathComponent("versions")
        initialDir = rootDir.appendingPathComponent("initial")
        try! FileManager.default.createDirectory(at: versionsDir, withIntermediateDirectories: true)
        try! FileManager.default.createDirectory(at: initialDir, withIntermediateDirectories: true)

        let suiteName = "MeteorWebApp-Cleanup-\(UUID().uuidString)"
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

    private func createInitialBundle() throws -> AssetBundle {
        try createBundle(version: "v-initial", directory: initialDir)
    }

    private func createManager(initial: AssetBundle) -> AssetBundleManager {
        AssetBundleManager(
            configuration: configuration,
            versionsDirectoryURL: versionsDir,
            initialAssetBundle: initial,
            sessionConfiguration: sessionConfig)
    }

    func testRemoveAllDownloadedAssetBundlesExceptFor_removesOlderVersions() throws {
        let v1 = "v-cleanup-1"
        let v2 = "v-cleanup-2"

        let initial = try createInitialBundle()
        _ = try createBundle(version: v1, directory: versionsDir.appendingPathComponent(v1), parent: initial)
        _ = try createBundle(version: v2, directory: versionsDir.appendingPathComponent(v2), parent: initial)

        let manager = createManager(initial: initial)
        let keep = try XCTUnwrap(manager.downloadedAssetBundleWithVersion(v2))

        try manager.removeAllDownloadedAssetBundlesExceptFor(keep)

        XCTAssertFalse(
            FileManager.default.fileExists(atPath: versionsDir.appendingPathComponent(v1).path),
            "Older version should be removed")
        XCTAssertTrue(
            FileManager.default.fileExists(atPath: versionsDir.appendingPathComponent(v2).path),
            "Kept version should remain")
    }

    func testLoadDownloadedAssetBundles_discoversValidVersionFromDisk() throws {
        let version = "v-discover"

        let initial = try createInitialBundle()
        _ = try createBundle(
            version: version,
            directory: versionsDir.appendingPathComponent(version),
            parent: initial)

        let manager = createManager(initial: initial)
        let discovered = manager.downloadedAssetBundleWithVersion(version)

        XCTAssertNotNil(discovered, "Manager should discover pre-existing version on disk")
        XCTAssertEqual(discovered?.version, version)
    }

    func testLoadDownloadedAssetBundles_skipsSpecialDirectoriesAndCorruptBundle() throws {
        let initial = try createInitialBundle()

        _ = try createBundle(
            version: "v-valid",
            directory: versionsDir.appendingPathComponent("v-valid"),
            parent: initial)
        _ = try createBundle(
            version: "PartialDownload",
            directory: versionsDir.appendingPathComponent("PartialDownload"),
            parent: initial)
        _ = try createBundle(
            version: "Downloading",
            directory: versionsDir.appendingPathComponent("Downloading"),
            parent: initial)

        let corruptDir = versionsDir.appendingPathComponent("v-corrupt")
        try FileManager.default.createDirectory(at: corruptDir, withIntermediateDirectories: true)
        try "{not-json}".write(
            to: corruptDir.appendingPathComponent("program.json"),
            atomically: true,
            encoding: .utf8)
        try "<html><body>invalid</body></html>".write(
            to: corruptDir.appendingPathComponent("index.html"),
            atomically: true,
            encoding: .utf8)

        let manager = createManager(initial: initial)

        XCTAssertNotNil(manager.downloadedAssetBundleWithVersion("v-valid"))
        XCTAssertNil(
            manager.downloadedAssetBundleWithVersion("PartialDownload"),
            "PartialDownload directory should be ignored by discovery")
        XCTAssertNil(
            manager.downloadedAssetBundleWithVersion("Downloading"),
            "Downloading directory should be ignored by discovery")
        XCTAssertNil(
            manager.downloadedAssetBundleWithVersion("v-corrupt"),
            "Corrupt bundle should be skipped during discovery")
    }
}
