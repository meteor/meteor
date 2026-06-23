import XCTest

@testable import MeteorjsCapacitor

final class AssetBundleTests: XCTestCase {

    private var tempDir: URL!

    override func setUp() {
        super.setUp()
        tempDir = FileManager.default.temporaryDirectory
            .appendingPathComponent("AssetBundleTests-\(UUID().uuidString)")
        try! FileManager.default.createDirectory(at: tempDir, withIntermediateDirectories: true)
    }

    override func tearDown() {
        try? FileManager.default.removeItem(at: tempDir)
        super.tearDown()
    }

    // MARK: - Tests

    func testInitFromManifest() throws {
        let builder = TestBundleBuilder(
            version: "v-test", appId: "test-app",
            rootUrl: "http://example.com", compatibility: "ios-1")
            .addAsset("app/main.js", type: "js", content: "console.log('hello');")

        let bundleDir = tempDir.appendingPathComponent("bundle")
        try builder.writeToDirectory(bundleDir)

        let bundle = try AssetBundle(directoryURL: bundleDir)

        XCTAssertEqual(bundle.version, "v-test")
        XCTAssertEqual(bundle.cordovaCompatibilityVersion, "ios-1")
        // main.js + index.html
        XCTAssertGreaterThanOrEqual(bundle.ownAssets.count, 2)
    }

    func testIndexFileAlwaysPresent() throws {
        // Even with no declared assets, index.html is always created
        let builder = TestBundleBuilder(
            version: "v-idx", appId: "test-app",
            rootUrl: "http://example.com", compatibility: "ios-1")

        let bundleDir = tempDir.appendingPathComponent("bundle")
        try builder.writeToDirectory(bundleDir)

        let bundle = try AssetBundle(directoryURL: bundleDir)

        XCTAssertNotNil(bundle.indexFile)
        XCTAssertEqual(bundle.indexFile?.urlPath, "/")
        XCTAssertEqual(bundle.indexFile?.filePath, "index.html")
    }

    func testAssetLookupByURLPath() throws {
        let builder = TestBundleBuilder(
            version: "v-lookup", appId: "test-app",
            rootUrl: "http://example.com", compatibility: "ios-1")
            .addAsset("app/main.js", type: "js", content: "var x = 1;")

        let bundleDir = tempDir.appendingPathComponent("bundle")
        try builder.writeToDirectory(bundleDir)

        let bundle = try AssetBundle(directoryURL: bundleDir)

        let asset = bundle.assetForURLPath("/app/main.js")
        XCTAssertNotNil(asset)
        XCTAssertEqual(asset?.filePath, "app/main.js")
    }

    func testCachedAssetRequiresMatchingHash() throws {
        let content = "var cached = true;"
        let hash = TestBundleBuilder.sha1Hex(content)

        let builder = TestBundleBuilder(
            version: "v-cache", appId: "test-app",
            rootUrl: "http://example.com", compatibility: "ios-1")
            .addAsset("app/main.js", type: "js", content: content)

        let bundleDir = tempDir.appendingPathComponent("bundle")
        try builder.writeToDirectory(bundleDir)

        let bundle = try AssetBundle(directoryURL: bundleDir)

        // Correct hash → returns asset
        let cached = bundle.cachedAssetForURLPath("/app/main.js", hash: hash)
        XCTAssertNotNil(cached)

        // Wrong hash → nil
        let wrong = bundle.cachedAssetForURLPath("/app/main.js", hash: "0000000000000000000000000000000000000000")
        XCTAssertNil(wrong)
    }

    func testInheritsAssetsFromParentBundle() throws {
        // Parent has asset A, child doesn't override it → child resolves A via parent
        let parentBuilder = TestBundleBuilder(
            version: "v-parent", appId: "test-app",
            rootUrl: "http://example.com", compatibility: "ios-1")
            .addAsset("app/shared.js", type: "js", content: "// shared")
            .addAsset("app/parent-only.js", type: "js", content: "// parent only")

        let parentDir = tempDir.appendingPathComponent("parent")
        try parentBuilder.writeToDirectory(parentDir)
        let parentBundle = try AssetBundle(directoryURL: parentDir)

        let childBuilder = TestBundleBuilder(
            version: "v-child", appId: "test-app",
            rootUrl: "http://example.com", compatibility: "ios-1")
            .addAsset("app/child-only.js", type: "js", content: "// child only")

        let childDir = tempDir.appendingPathComponent("child")
        try childBuilder.writeToDirectory(childDir)
        let childBundle = try AssetBundle(directoryURL: childDir, parentAssetBundle: parentBundle)

        // Child's own asset
        XCTAssertNotNil(childBundle.assetForURLPath("/app/child-only.js"))
        // Parent asset accessible via parent chain
        XCTAssertNotNil(childBundle.assetForURLPath("/app/parent-only.js"))
    }

    func testRuntimeConfigParsing() throws {
        let builder = TestBundleBuilder(
            version: "v-rc", appId: "my-app-id",
            rootUrl: "http://example.com", compatibility: "ios-1")

        let bundleDir = tempDir.appendingPathComponent("bundle")
        try builder.writeToDirectory(bundleDir)

        let bundle = try AssetBundle(directoryURL: bundleDir)
        let config = bundle.runtimeConfig

        XCTAssertNotNil(config)
        XCTAssertEqual(config?.appId, "my-app-id")
        XCTAssertEqual(config?.rootURL, URL(string: "http://example.com"))
        XCTAssertEqual(config?.autoupdateVersionCordova, "v-rc")
    }

    func testMissingRuntimeConfigScriptThrowsUnsuitableAssetBundle() throws {
        let indexURL = tempDir.appendingPathComponent("index-without-config.html")
        try "<html><head></head><body>no runtime config</body></html>".write(
            to: indexURL,
            atomically: true,
            encoding: .utf8)

        XCTAssertThrowsError(try loadRuntimeConfigFromIndexFileAtURL(indexURL)) { error in
            guard case .unsuitableAssetBundle(let reason, _) = error as? WebAppError else {
                XCTFail("Expected WebAppError.unsuitableAssetBundle, got \(error)")
                return
            }

            XCTAssertTrue(
                reason.contains("Couldn't load runtime config from index file"),
                "Unexpected failure reason: \(reason)")
        }
    }

    func testManifestURLPathWithQueryStringIsNormalizedAtBundleLevel() throws {
        let bundleDir = tempDir.appendingPathComponent("bundle-with-query-url")
        let assetDir = bundleDir.appendingPathComponent("app")
        try FileManager.default.createDirectory(at: assetDir, withIntermediateDirectories: true)

        let manifest = """
        {
            "version": "v-query",
            "cordovaCompatibilityVersions": {"ios": "ios-1"},
            "manifest": [
                {
                    "where": "client",
                    "path": "app/main.js",
                    "url": "/app/main.js?meteor_dont_serve_index=true",
                    "type": "js",
                    "cacheable": true,
                    "hash": "0123456789012345678901234567890123456789"
                }
            ]
        }
        """

        try manifest.write(
            to: bundleDir.appendingPathComponent("program.json"),
            atomically: true,
            encoding: .utf8)
        try "<html></html>".write(
            to: bundleDir.appendingPathComponent("index.html"),
            atomically: true,
            encoding: .utf8)
        try "console.log('query url test');".write(
            to: bundleDir.appendingPathComponent("app/main.js"),
            atomically: true,
            encoding: .utf8)

        let bundle = try AssetBundle(directoryURL: bundleDir)
        let resolved = bundle.assetForURLPath("/app/main.js")

        XCTAssertNotNil(resolved)
        XCTAssertEqual(resolved?.filePath, "app/main.js")
    }
}
