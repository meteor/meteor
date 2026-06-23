// Vendored from https://github.com/banjerluke/capacitor-meteor-webapp
// Copyright 2025 Luke Abbott. MIT license. See LICENSES/banjerluke-capacitor-meteor-webapp.txt.

//
// CapacitorMeteorWebAppPlugin.swift
//
// Main plugin class that bridges the Meteor webapp functionality
// to Capacitor, providing hot code push capabilities for iOS.
//

import Capacitor
import Foundation
import WebKit

// Bridge adapter to implement our protocol with Capacitor
class CapacitorBridgeAdapter: CapacitorBridge {
    weak var bridge: CAPBridgeProtocol?

    init(bridge: CAPBridgeProtocol?) {
        self.bridge = bridge
    }

    func setServerBasePath(_ path: String) {
        bridge?.setServerBasePath(path)
    }

    func getWebView() -> AnyObject? {
        return bridge?.webView
    }

    var webView: WKWebView? {
        return bridge?.webView
    }

    func reload() {
        // CAPBridgeProtocol doesn't have a reload method, so we reload the webView directly
        bridge?.webView?.reload()
    }
}

/// Capacitor MeteorWebApp Plugin
/// Enables hot code push functionality for Meteor apps
@objc(CapacitorMeteorWebAppPlugin)
public class CapacitorMeteorWebAppPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CapacitorMeteorWebAppPlugin"
    public let jsName = "CapacitorMeteorWebApp"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "checkForUpdates", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startupDidComplete", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getCurrentVersion", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isUpdateAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "reload", returnType: CAPPluginReturnPromise)
    ]
    private var implementation: CapacitorMeteorWebApp!
    private var bridgeAdapter: CapacitorBridgeAdapter!

    override public func load() {
        bridgeAdapter = CapacitorBridgeAdapter(bridge: self.bridge)
        implementation = CapacitorMeteorWebApp(capacitorBridge: bridgeAdapter)

        // Listen for update notifications from the implementation
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleUpdateAvailable(_:)),
            name: .meteorWebappUpdateAvailable,
            object: nil
        )

        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleUpdateFailed(_:)),
            name: .meteorWebappUpdateFailed,
            object: nil
        )
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    @objc private func handleUpdateAvailable(_ notification: Notification) {
        guard let userInfo = notification.userInfo,
              let version = userInfo["version"] as? String
        else {
            NSLog("❌ MeteorjsCapacitor: No version in notification userInfo")
            return
        }

        NSLog("🔔 MeteorjsCapacitor: Notifying JS listeners about version: \(version)")
        notifyListeners("updateAvailable", data: ["version": version])
    }

    @objc private func handleUpdateFailed(_ notification: Notification) {
        guard let userInfo = notification.userInfo,
              let errorMessage = userInfo["error"] as? String
        else { return }

        NSLog(
            "🔔 MeteorjsCapacitor: Notifying JS listeners about error: \(errorMessage)"
        )
        notifyListeners("error", data: ["message": errorMessage])
    }

    @objc func checkForUpdates(_ call: CAPPluginCall) {
        implementation.checkForUpdates { error in
            if let error = error {
                call.reject(error.localizedDescription)
            } else {
                call.resolve()
            }
        }
    }

    @objc func startupDidComplete(_ call: CAPPluginCall) {
        implementation.startupDidComplete { error in
            if let error = error {
                call.reject(error.localizedDescription)
            } else {
                call.resolve()
            }
        }
    }

    @objc func getCurrentVersion(_ call: CAPPluginCall) {
        let version = implementation.getCurrentVersion()
        call.resolve(["version": version])
    }

    @objc func isUpdateAvailable(_ call: CAPPluginCall) {
        let available = implementation.isUpdateAvailable()
        call.resolve(["available": available])
    }

    @objc func reload(_ call: CAPPluginCall) {
        implementation.reload { error in
            if let error = error {
                call.reject(error.localizedDescription)
            } else {
                call.resolve()
            }
        }
    }
}
