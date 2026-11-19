import XCTest

@testable import MeteorjsCapacitor

final class BundleOrganizerTests: XCTestCase {

    private var tempDir: URL!

    override func setUp() {
        super.setUp()
        tempDir = FileManager.default.temporaryDirectory
            .appendingPathComponent("BundleOrganizerTests-\(UUID().uuidString)")
        try! FileManager.default.createDirectory(at: tempDir, withIntermediateDirectories: true)
    }

    override func tearDown() {
        try? FileManager.default.removeItem(at: tempDir)
        super.tearDown()
    }

    // MARK: - Tests

    func testOrganizeBundleInjectsShimAndCopiesAssets() throws {
        let builder = TestBundleBuilder(
            version: "v-org", appId: "test-app",
            rootUrl: "http://example.com", compatibility: "ios-1")
            .addAsset("app/main.js", type: "js", content: "console.log('org');")
            .addAsset("app/style.css", type: "css", content: "body{}")

        let bundleDir = tempDir.appendingPathComponent("bundle")
        try builder.writeToDirectory(bundleDir)
        let bundle = try AssetBundle(directoryURL: bundleDir)

        let targetDir = tempDir.appendingPathComponent("organized")
        try BundleOrganizer.organizeBundle(bundle, in: targetDir)

        // index.html should contain the WebAppLocalServer shim
        let indexURL = targetDir.appendingPathComponent("index.html")
        let indexContent = try String(contentsOf: indexURL, encoding: .utf8)
        XCTAssertTrue(indexContent.contains("WebAppLocalServer"),
            "index.html should contain WebAppLocalServer shim")

        // Other assets should exist at their URL-path locations
        XCTAssertTrue(FileManager.default.fileExists(
            atPath: targetDir.appendingPathComponent("app/main.js").path))
        XCTAssertTrue(FileManager.default.fileExists(
            atPath: targetDir.appendingPathComponent("app/style.css").path))
    }

    func testValidateBundleDetectsTraversal() throws {
        let builder = TestBundleBuilder(
            version: "v-trav", appId: "test-app",
            rootUrl: "http://example.com", compatibility: "ios-1")

        let bundleDir = tempDir.appendingPathComponent("bundle")
        try builder.writeToDirectory(bundleDir)
        let bundle = try AssetBundle(directoryURL: bundleDir)

        // Manually inject a malicious asset with ".." in the URL path
        let maliciousAsset = Asset(
            bundle: bundle, filePath: "../../etc/passwd",
            urlPath: "/../../etc/passwd", fileType: "text", cacheable: false)
        bundle.addAsset(maliciousAsset)

        let errors = BundleOrganizer.validateBundleOrganization(bundle)
        XCTAssertFalse(errors.isEmpty, "Should detect path traversal")
        XCTAssertTrue(errors.first?.contains("..") ?? false)
    }

    func testValidateBundleDetectsDuplicateNormalizedURLPath() throws {
        let builder = TestBundleBuilder(
            version: "v-dup", appId: "test-app",
            rootUrl: "http://example.com", compatibility: "ios-1")
            .addAsset("app/main.js", type: "js", content: "console.log('ok');")

        let bundleDir = tempDir.appendingPathComponent("bundle")
        try builder.writeToDirectory(bundleDir)
        let bundle = try AssetBundle(directoryURL: bundleDir)

        let duplicateA = Asset(
            bundle: bundle, filePath: "app/dup-a.js",
            urlPath: "/app/dup.js?build=1", fileType: "js", cacheable: true)
        let duplicateB = Asset(
            bundle: bundle, filePath: "app/dup-b.js",
            urlPath: "/app/dup.js?build=2", fileType: "js", cacheable: true)
        bundle.addAsset(duplicateA)
        bundle.addAsset(duplicateB)

        let errors = BundleOrganizer.validateBundleOrganization(bundle)
        XCTAssertTrue(
            errors.contains(where: { $0.contains("Duplicate normalized URL path: app/dup.js") }),
            "Should detect duplicate URL paths after query normalization")
    }

    func testValidateBundleDetectsInvalidFilePaths() throws {
        let builder = TestBundleBuilder(
            version: "v-filepath", appId: "test-app",
            rootUrl: "http://example.com", compatibility: "ios-1")

        let bundleDir = tempDir.appendingPathComponent("bundle")
        try builder.writeToDirectory(bundleDir)
        let bundle = try AssetBundle(directoryURL: bundleDir)

        bundle.addAsset(Asset(
            bundle: bundle, filePath: "../escape.js",
            urlPath: "/bad-traversal.js", fileType: "js", cacheable: true))
        bundle.addAsset(Asset(
            bundle: bundle, filePath: "/absolute.js",
            urlPath: "/bad-absolute.js", fileType: "js", cacheable: true))
        bundle.addAsset(Asset(
            bundle: bundle, filePath: "app\\windows.js",
            urlPath: "/bad-backslash.js", fileType: "js", cacheable: true))
        bundle.addAsset(Asset(
            bundle: bundle, filePath: "app//double-slash.js",
            urlPath: "/bad-empty-segment.js", fileType: "js", cacheable: true))

        let errors = BundleOrganizer.validateBundleOrganization(bundle)
        XCTAssertTrue(
            errors.contains(where: { $0.contains("Invalid filePath for asset '../escape.js'") }),
            "Should reject traversal in filePath")
        XCTAssertTrue(
            errors.contains(where: { $0.contains("Invalid filePath for asset '/absolute.js'") }),
            "Should reject absolute filePath")
        XCTAssertTrue(
            errors.contains(where: { $0.contains("backslashes are not allowed") }),
            "Should reject backslashes in filePath")
        XCTAssertTrue(
            errors.contains(where: { $0.contains("Invalid filePath for asset 'app//double-slash.js'") }),
            "Should reject empty path segments in filePath")
    }

    func testTargetURLMapping() throws {
        let builder = TestBundleBuilder(
            version: "v-url", appId: "test-app",
            rootUrl: "http://example.com", compatibility: "ios-1")

        let bundleDir = tempDir.appendingPathComponent("bundle")
        try builder.writeToDirectory(bundleDir)
        let bundle = try AssetBundle(directoryURL: bundleDir)
        let targetDir = tempDir.appendingPathComponent("target")

        // Leading slash is stripped
        let jsAsset = Asset(
            bundle: bundle, filePath: "app/main.js",
            urlPath: "/app/main.js", fileType: "js", cacheable: true)
        let jsTarget = BundleOrganizer.targetURLForAsset(jsAsset, in: targetDir)
        XCTAssertEqual(jsTarget, targetDir.appendingPathComponent("app/main.js"))

        // Root path "/" maps to "index.html"
        let indexAsset = Asset(
            bundle: bundle, filePath: "index.html",
            urlPath: "/", fileType: "html", cacheable: false)
        let indexTarget = BundleOrganizer.targetURLForAsset(indexAsset, in: targetDir)
        XCTAssertEqual(indexTarget, targetDir.appendingPathComponent("index.html"))
    }

    func testCleanupRemovesDirectory() throws {
        let builder = TestBundleBuilder(
            version: "v-clean", appId: "test-app",
            rootUrl: "http://example.com", compatibility: "ios-1")
            .addAsset("app/main.js", type: "js", content: "cleanup")

        let bundleDir = tempDir.appendingPathComponent("bundle")
        try builder.writeToDirectory(bundleDir)
        let bundle = try AssetBundle(directoryURL: bundleDir)

        let targetDir = tempDir.appendingPathComponent("organized")
        try BundleOrganizer.organizeBundle(bundle, in: targetDir)
        XCTAssertTrue(FileManager.default.fileExists(atPath: targetDir.path))

        try BundleOrganizer.cleanupOrganizedBundle(at: targetDir)
        XCTAssertFalse(FileManager.default.fileExists(atPath: targetDir.path))
    }

    func testOrganizeBundleSkipsMissingNonCriticalAsset() throws {
        // Build a bundle with a .well-known file in the manifest, then delete it
        // from disk before organizing. Simulates APK ignoreAssetsPattern excluding
        // dot-files from the bundle.
        let builder = TestBundleBuilder(
            version: "v-skip", appId: "test-app",
            rootUrl: "http://example.com", compatibility: "ios-1")
            .addAsset("app/main.js", type: "js", content: "console.log('ok');")
            .addAsset(".well-known/apple-app-site-association", type: "json", content: "{}")

        let bundleDir = tempDir.appendingPathComponent("bundle")
        try builder.writeToDirectory(bundleDir)

        // Delete the .well-known file to simulate it being excluded from the bundle
        try FileManager.default.removeItem(
            at: bundleDir.appendingPathComponent(".well-known/apple-app-site-association"))

        let bundle = try AssetBundle(directoryURL: bundleDir)

        let targetDir = tempDir.appendingPathComponent("organized")
        // Should succeed — missing non-critical asset is skipped with a warning
        try BundleOrganizer.organizeBundle(bundle, in: targetDir)

        XCTAssertTrue(FileManager.default.fileExists(
            atPath: targetDir.appendingPathComponent("index.html").path),
            "index.html should be organized")
        XCTAssertTrue(FileManager.default.fileExists(
            atPath: targetDir.appendingPathComponent("app/main.js").path),
            "main.js should be organized")
        XCTAssertFalse(FileManager.default.fileExists(
            atPath: targetDir.appendingPathComponent(".well-known/apple-app-site-association").path),
            "missing asset should not appear in organized bundle")
    }

    func testOrganizeBundleThrowsForMissingIndexHtml() throws {
        let builder = TestBundleBuilder(
            version: "v-noindex", appId: "test-app",
            rootUrl: "http://example.com", compatibility: "ios-1")
            .addAsset("app/main.js", type: "js", content: "console.log('ok');")

        let bundleDir = tempDir.appendingPathComponent("bundle")
        try builder.writeToDirectory(bundleDir)

        // Delete index.html — this is critical and must cause a failure
        try FileManager.default.removeItem(
            at: bundleDir.appendingPathComponent("index.html"))

        let bundle = try AssetBundle(directoryURL: bundleDir)

        let targetDir = tempDir.appendingPathComponent("organized")
        XCTAssertThrowsError(try BundleOrganizer.organizeBundle(bundle, in: targetDir)) { error in
            guard let webAppError = error as? WebAppError else {
                XCTFail("Expected WebAppError, got \(type(of: error))")
                return
            }
            XCTAssertTrue(webAppError.description.contains("Source file does not exist"),
                "Error should reference missing source file")
        }
    }

    func testOrganizeBundleSkipsMissingSourceMap() throws {
        let builder = TestBundleBuilder(
            version: "v-map", appId: "test-app",
            rootUrl: "http://example.com", compatibility: "ios-1")
            .addAssetWithSourceMap("app/main.js", type: "js",
                content: "console.log('ok');", sourceMapPath: "app/main.js.map")

        let bundleDir = tempDir.appendingPathComponent("bundle")
        try builder.writeToDirectory(bundleDir)
        // Source map file is not written by the builder (only assets are written),
        // so app/main.js.map is already missing. Verify organization still succeeds.

        let bundle = try AssetBundle(directoryURL: bundleDir)

        let targetDir = tempDir.appendingPathComponent("organized")
        try BundleOrganizer.organizeBundle(bundle, in: targetDir)

        XCTAssertTrue(FileManager.default.fileExists(
            atPath: targetDir.appendingPathComponent("index.html").path),
            "index.html should be organized")
        XCTAssertTrue(FileManager.default.fileExists(
            atPath: targetDir.appendingPathComponent("app/main.js").path),
            "main.js should be organized")
        XCTAssertFalse(FileManager.default.fileExists(
            atPath: targetDir.appendingPathComponent("app/main.js.map").path),
            "source map should not appear in organized bundle")
    }

    func testOrganizeBundleHandlesInheritedAssets() throws {
        let parentBuilder = TestBundleBuilder(
            version: "v-parent", appId: "test-app",
            rootUrl: "http://example.com", compatibility: "ios-1")
            .addAsset("app/shared.js", type: "js", content: "// shared")

        let parentDir = tempDir.appendingPathComponent("parent")
        try parentBuilder.writeToDirectory(parentDir)
        let parentBundle = try AssetBundle(directoryURL: parentDir)

        let childBuilder = TestBundleBuilder(
            version: "v-child", appId: "test-app",
            rootUrl: "http://example.com", compatibility: "ios-1")
            .addAsset("app/child.js", type: "js", content: "// child")

        let childDir = tempDir.appendingPathComponent("child")
        try childBuilder.writeToDirectory(childDir)
        let childBundle = try AssetBundle(directoryURL: childDir, parentAssetBundle: parentBundle)

        let targetDir = tempDir.appendingPathComponent("organized")
        try BundleOrganizer.organizeBundle(childBundle, in: targetDir)

        // Child's own asset
        XCTAssertTrue(FileManager.default.fileExists(
            atPath: targetDir.appendingPathComponent("app/child.js").path))
        // Parent's asset organized alongside
        XCTAssertTrue(FileManager.default.fileExists(
            atPath: targetDir.appendingPathComponent("app/shared.js").path))
    }
}
