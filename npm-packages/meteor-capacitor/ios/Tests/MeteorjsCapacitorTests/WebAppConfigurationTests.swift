import XCTest

@testable import MeteorjsCapacitor

final class WebAppConfigurationTests: XCTestCase {

    private var config: WebAppConfiguration!

    override func setUp() {
        super.setUp()
        let suiteName = "MeteorWebApp-Test-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suiteName)!
        config = WebAppConfiguration(userDefaults: defaults)
        config.reset()
    }

    override func tearDown() {
        config.reset()
        super.tearDown()
    }

    // MARK: - Tests

    func testPersistsAndRetrievesValues() {
        config.appId = "my-app"
        config.rootURL = URL(string: "http://example.com")
        config.cordovaCompatibilityVersion = "ios-1"
        config.lastSeenInitialVersion = "v1"
        config.lastDownloadedVersion = "v2"
        config.lastKnownGoodVersion = "v3"

        XCTAssertEqual(config.appId, "my-app")
        XCTAssertEqual(config.rootURL, URL(string: "http://example.com"))
        XCTAssertEqual(config.cordovaCompatibilityVersion, "ios-1")
        XCTAssertEqual(config.lastSeenInitialVersion, "v1")
        XCTAssertEqual(config.lastDownloadedVersion, "v2")
        XCTAssertEqual(config.lastKnownGoodVersion, "v3")
    }

    func testResetClearsAllValues() {
        config.appId = "my-app"
        config.rootURL = URL(string: "http://example.com")
        config.cordovaCompatibilityVersion = "ios-1"
        config.lastSeenInitialVersion = "v1"
        config.lastDownloadedVersion = "v2"
        config.lastKnownGoodVersion = "v3"

        config.reset()

        XCTAssertNil(config.appId)
        XCTAssertNil(config.rootURL)
        XCTAssertNil(config.cordovaCompatibilityVersion)
        XCTAssertNil(config.lastSeenInitialVersion)
        XCTAssertNil(config.lastDownloadedVersion)
        XCTAssertNil(config.lastKnownGoodVersion)
        XCTAssertTrue(config.blacklistedVersions.isEmpty)
        XCTAssertTrue(config.versionsToRetry.isEmpty)
    }

    func testAddBlacklistedVersionFirstTimeGoesToRetry() {
        config.addBlacklistedVersion("v-faulty")

        XCTAssertTrue(config.versionsToRetry.contains("v-faulty"))
        XCTAssertFalse(config.blacklistedVersions.contains("v-faulty"))
    }

    func testAddBlacklistedVersionSecondTimeGoesToBlacklist() {
        config.addBlacklistedVersion("v-faulty")
        config.addBlacklistedVersion("v-faulty")

        XCTAssertFalse(config.versionsToRetry.contains("v-faulty"))
        XCTAssertTrue(config.blacklistedVersions.contains("v-faulty"))
    }

    func testBlacklistDoesNotDuplicate() {
        config.addBlacklistedVersion("v-faulty")
        config.addBlacklistedVersion("v-faulty")
        config.addBlacklistedVersion("v-faulty")  // third call

        let count = config.blacklistedVersions.filter { $0 == "v-faulty" }.count
        XCTAssertEqual(count, 1, "Version should appear exactly once in blacklist")
    }
}
