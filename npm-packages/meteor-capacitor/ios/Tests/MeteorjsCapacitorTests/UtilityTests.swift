import XCTest

@testable import MeteorjsCapacitor

final class UtilityTests: XCTestCase {

    func testURLPathByRemovingQueryString() {
        XCTAssertEqual(URLPathByRemovingQueryString("/path?query=value"), "/path")
        XCTAssertEqual(URLPathByRemovingQueryString("/path"), "/path")
        XCTAssertEqual(URLPathByRemovingQueryString("/a/b/c?x=1&y=2"), "/a/b/c")
    }

    func testSHA1HashFromETag() {
        // Valid ETag with 40-char hex hash
        let hash = SHA1HashFromETag("\"0123456789abcdef0123456789abcdef01234567\"")
        XCTAssertEqual(hash, "0123456789abcdef0123456789abcdef01234567")
    }

    func testSHA1HashFromETagReturnsNilForInvalidETag() {
        XCTAssertNil(SHA1HashFromETag("not-an-etag"))
        XCTAssertNil(SHA1HashFromETag("\"short\""))
        XCTAssertNil(SHA1HashFromETag("\"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ\""))
    }

    func testURLIsDirectory() throws {
        let dir = FileManager.default.temporaryDirectory
            .appendingPathComponent("UtilityTests-dir-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: dir) }

        XCTAssertEqual(dir.isDirectory, true)
        XCTAssertEqual(dir.isRegularFile, false)
    }

    func testURLIsRegularFile() throws {
        let file = FileManager.default.temporaryDirectory
            .appendingPathComponent("UtilityTests-file-\(UUID().uuidString)")
        try "hello".write(to: file, atomically: true, encoding: .utf8)
        defer { try? FileManager.default.removeItem(at: file) }

        XCTAssertEqual(file.isRegularFile, true)
        XCTAssertEqual(file.isDirectory, false)
    }
}
