// Vendored from https://github.com/banjerluke/capacitor-meteor-webapp
// Copyright 2025 Luke Abbott. MIT license. See LICENSES/banjerluke-capacitor-meteor-webapp.txt.

//
// NetworkReachabilityManager.swift
//
// Monitors network reachability status using Apple's Network framework
// and notifies delegates of connectivity changes.
//
// This file is ported from METNetworkReachabilityManager.m in cordova-plugin-meteor-webapp,
// translated from Objective-C to Swift and updated to use Network framework for Capacitor.
//

import Foundation
import Network

enum NetworkReachabilityStatus {
    case unknown
    case notReachable
    case reachable
}

protocol NetworkReachabilityManagerDelegate: AnyObject {
    func networkReachabilityManager(
        _ reachabilityManager: NetworkReachabilityManager,
        didDetectReachabilityStatusChange reachabilityStatus: NetworkReachabilityStatus)
}

@available(macOS 10.14, iOS 12.0, *)
final class NetworkReachabilityManager {
    private let monitor: NWPathMonitor
    private let queue: DispatchQueue
    weak var delegate: NetworkReachabilityManagerDelegate?
    var delegateQueue: DispatchQueue?

    private(set) var reachabilityStatus: NetworkReachabilityStatus = .unknown

    // Cordova used SCNetworkReachability which supported host-specific
    // monitoring. NWPathMonitor (iOS 12+) is Apple's modern replacement
    // but only monitors general connectivity, not per-host reachability.
    // The practical difference is minimal for our use case (retry gating).
    init() {
        self.queue = DispatchQueue(label: "com.meteor.webapp.NetworkReachabilityManager")
        self.monitor = NWPathMonitor()
    }

    deinit {
        stopMonitoring()
    }

    func startMonitoring() -> Bool {
        monitor.pathUpdateHandler = { [weak self] path in
            guard let self = self else { return }

            let newStatus: NetworkReachabilityStatus =
                path.status == .satisfied ? .reachable : .notReachable

            if newStatus != self.reachabilityStatus {
                self.reachabilityStatus = newStatus
                self.notifyDelegateOfStatusChange(newStatus)
            }
        }

        monitor.start(queue: queue)
        return true
    }

    func stopMonitoring() {
        monitor.cancel()
    }

    private func notifyDelegateOfStatusChange(_ status: NetworkReachabilityStatus) {
        let targetQueue = delegateQueue ?? DispatchQueue.main

        targetQueue.async { [weak self] in
            guard let self = self else { return }
            self.delegate?.networkReachabilityManager(self, didDetectReachabilityStatusChange: status)
        }
    }
}
