import XCTest

@testable import MeteorjsCapacitor

final class AssetManifestTests: XCTestCase {

    private func manifestData(_ json: String) -> Data {
        return json.data(using: .utf8)!
    }

    private func assertInvalidManifest(
        data: Data,
        reasonContains expectedReasonFragment: String? = nil,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        do {
            _ = try AssetManifest(data: data)
            XCTFail("Expected invalid asset manifest error", file: file, line: line)
        } catch let error as WebAppError {
            guard case .invalidAssetManifest(let reason, _) = error else {
                XCTFail("Expected .invalidAssetManifest, got \(error)", file: file, line: line)
                return
            }
            if let expectedReasonFragment {
                XCTAssertTrue(
                    reason.contains(expectedReasonFragment),
                    "Expected reason to contain '\(expectedReasonFragment)', got '\(reason)'",
                    file: file,
                    line: line)
            }
        } catch {
            XCTFail("Expected WebAppError, got \(error)", file: file, line: line)
        }
    }

    private func assertInvalidManifest(
        json: String,
        reasonContains expectedReasonFragment: String? = nil,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        assertInvalidManifest(
            data: manifestData(json),
            reasonContains: expectedReasonFragment,
            file: file,
            line: line)
    }

    // MARK: - Parsing

    func testParsesClientEntriesOnly() throws {
        let json = """
        {
            "version": "v1",
            "cordovaCompatibilityVersions": {"ios": "ios-1"},
            "manifest": [
                {"where": "client", "path": "app.js", "url": "/app.js", "type": "js", "cacheable": true, "hash": "abc123"},
                {"where": "internal", "path": "packages.js", "url": "/packages.js", "type": "js", "cacheable": true, "hash": "def456"},
                {"where": "server", "path": "server.js", "url": "/server.js", "type": "js", "cacheable": true, "hash": "ghi789"},
                {"where": "client", "path": "style.css", "url": "/style.css", "type": "css", "cacheable": true, "hash": "jkl012"}
            ]
        }
        """
        let manifest = try AssetManifest(data: manifestData(json))

        // Only "client" entries should be parsed
        XCTAssertEqual(manifest.entries.count, 2)
        XCTAssertEqual(manifest.entries[0].filePath, "app.js")
        XCTAssertEqual(manifest.entries[1].filePath, "style.css")
    }

    func testThrowsOnMissingVersion() {
        let json = """
        {
            "cordovaCompatibilityVersions": {"ios": "ios-1"},
            "manifest": []
        }
        """
        assertInvalidManifest(json: json, reasonContains: "version")
    }

    func testThrowsOnMissingCordovaCompatibilityVersion() {
        let json = """
        {
            "version": "v1",
            "cordovaCompatibilityVersions": {"android": "android-1"},
            "manifest": []
        }
        """
        assertInvalidManifest(json: json, reasonContains: "cordovaCompatibilityVersion")
    }

    func testThrowsOnMissingCordovaCompatibilityVersionsObject() {
        let json = """
        {
            "version": "v1",
            "manifest": []
        }
        """
        assertInvalidManifest(json: json, reasonContains: "cordovaCompatibilityVersion")
    }

    func testThrowsOnIncompatibleFormat() {
        let json = """
        {
            "format": "web-program-pre2",
            "version": "v1",
            "cordovaCompatibilityVersions": {"ios": "ios-1"},
            "manifest": []
        }
        """
        assertInvalidManifest(json: json, reasonContains: "incompatible")
    }

    func testThrowsOnInvalidJSON() {
        assertInvalidManifest(
            data: Data("{\"version\":\"v1\"".utf8),
            reasonContains: "Error parsing asset manifest")
    }

    func testParsesHashAndSourceMapFields() throws {
        let json = """
        {
            "version": "v1",
            "cordovaCompatibilityVersions": {"ios": "ios-1"},
            "manifest": [
                {
                    "where": "client",
                    "path": "app.js",
                    "url": "/app.js",
                    "type": "js",
                    "cacheable": true,
                    "hash": "abc123def456",
                    "sourceMap": "app.js.map",
                    "sourceMapUrl": "/app.js.map"
                }
            ]
        }
        """
        let manifest = try AssetManifest(data: manifestData(json))

        XCTAssertEqual(manifest.entries.count, 1)
        let entry = manifest.entries[0]
        XCTAssertEqual(entry.hash, "abc123def456")
        XCTAssertEqual(entry.sourceMapPath, "app.js.map")
        XCTAssertEqual(entry.sourceMapURLPath, "/app.js.map")
    }

    func testParsesMissingHashAsNil_hashIsOptionalByDesign() throws {
        let json = """
        {
            "version": "v1",
            "cordovaCompatibilityVersions": {"ios": "ios-1"},
            "manifest": [
                {
                    "where": "client",
                    "path": "app.js",
                    "url": "/app.js",
                    "type": "js",
                    "cacheable": true
                }
            ]
        }
        """
        let manifest = try AssetManifest(data: manifestData(json))

        XCTAssertEqual(manifest.entries.count, 1)
        let entry = manifest.entries[0]
        // hash is intentionally optional - assets without hashes skip cache validation.
        XCTAssertNil(entry.hash)
        XCTAssertNil(entry.sourceMapPath)
        XCTAssertNil(entry.sourceMapURLPath)
    }
}
