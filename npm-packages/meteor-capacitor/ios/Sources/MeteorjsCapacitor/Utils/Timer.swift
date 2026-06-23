// Vendored from https://github.com/banjerluke/capacitor-meteor-webapp
// Copyright 2025 Luke Abbott. MIT license. See LICENSES/banjerluke-capacitor-meteor-webapp.txt.

//
// Timer.swift
//
// Provides a thread-safe timer implementation using GCD for
// scheduling recurring operations with configurable tolerance.
//
// This file is ported from METTimer.m in cordova-plugin-meteor-webapp,
// translated from Objective-C to Swift for Capacitor.
//

import Foundation

final class Timer {
    private let queue: DispatchQueue
    private let block: () -> Void
    private var dispatchSourceTimer: DispatchSourceTimer?

    var tolerance: TimeInterval = 0.1

    init(queue: DispatchQueue, block: @escaping () -> Void) {
        self.queue = queue
        self.block = block
    }

    func start(withTimeInterval timeInterval: TimeInterval) {
        stop()  // Stop any existing timer

        dispatchSourceTimer = DispatchSource.makeTimerSource(queue: queue)
        dispatchSourceTimer?.schedule(
            deadline: .now() + timeInterval, leeway: .milliseconds(Int(tolerance * 1000)))
        dispatchSourceTimer?.setEventHandler { [weak self] in
            self?.block()
            self?.stop()
        }
        dispatchSourceTimer?.resume()
    }

    func stop() {
        dispatchSourceTimer?.cancel()
        dispatchSourceTimer = nil
    }

    deinit {
        stop()
    }
}
