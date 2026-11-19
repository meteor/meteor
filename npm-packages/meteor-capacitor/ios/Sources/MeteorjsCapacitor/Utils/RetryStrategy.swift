// Vendored from https://github.com/banjerluke/capacitor-meteor-webapp
// Copyright 2025 Luke Abbott. MIT license. See LICENSES/banjerluke-capacitor-meteor-webapp.txt.

//
// RetryStrategy.swift
//
// Implements triangular backoff retry logic for network operations.
// After one quick retry (0.1s), intervals follow 1 + n*(n+1)/2
// giving: 0.1, 1, 2, 4, 7, 11, 16, 22, 30, 30, 30...
//
// Originally ported from METRetryStrategy.m in cordova-plugin-meteor-webapp.
// Simplified from exponential to triangular backoff for more predictable
// retry cadence while keeping a 30s ceiling.
//

import Foundation

final class RetryStrategy {
    /// Interval for the first retry (transient failure recovery)
    var quickRetryInterval: TimeInterval = 0.1

    /// Maximum retry interval ceiling
    var maximumTimeInterval: TimeInterval = 30.0

    func retryIntervalForNumber(ofAttempts numberOfAttempts: UInt) -> TimeInterval {
        // First attempt: quick retry for transient failures
        if numberOfAttempts == 0 {
            return quickRetryInterval
        }

        // Subsequent attempts: triangular backoff 1 + n*(n+1)/2
        let n = Double(numberOfAttempts - 1)
        let interval = 1.0 + n * (n + 1.0) / 2.0

        return min(interval, maximumTimeInterval)
    }
}
