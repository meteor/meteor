import XCTest

@testable import MeteorjsCapacitor

final class RetryStrategyTests: XCTestCase {

    func testTriangularBackoffMatchesExpectedIntervals() {
        let strategy = RetryStrategy()
        // Expected sequence: 0.1, 1, 2, 4, 7, 11, 16, 22, 29, 30
        // Formula: attempt 0 → 0.1 (quick); attempt n≥1 → 1 + T(n-1) where T(k) = k*(k+1)/2
        let expected: [TimeInterval] = [0.1, 1, 2, 4, 7, 11, 16, 22, 29, 30]

        for (attempt, expectedInterval) in expected.enumerated() {
            let actual = strategy.retryIntervalForNumber(ofAttempts: UInt(attempt))
            XCTAssertEqual(actual, expectedInterval, accuracy: 0.001,
                "Attempt \(attempt): expected \(expectedInterval), got \(actual)")
        }
    }
}
