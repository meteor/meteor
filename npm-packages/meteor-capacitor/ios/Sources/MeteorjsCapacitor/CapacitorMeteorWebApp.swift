// Vendored from https://github.com/banjerluke/capacitor-meteor-webapp
// Copyright 2025 Luke Abbott. MIT license. See LICENSES/banjerluke-capacitor-meteor-webapp.txt.

//
// CapacitorMeteorWebApp.swift
//
// Core implementation of the Meteor webapp functionality for Capacitor,
// managing asset bundles, updates, and the web view integration.
//
// This is largely adapted from WebAppLocalServer.swift from the old
// cordova-plugin-meteor-webapp project. We don't embed our own web server
// any more, however; instead, we use Capacitor's built-in server.
//

import Foundation
import WebKit
import os.log

// MARK: - Notification Names
extension Notification.Name {
    static let meteorWebappUpdateAvailable = Notification.Name("MeteorWebappUpdateAvailable")
    static let meteorWebappUpdateFailed = Notification.Name("MeteorWebappUpdateFailed")
}

// Protocol for Capacitor bridge to avoid direct dependency
public protocol CapacitorBridge: AnyObject {
    func setServerBasePath(_ path: String)
    func getWebView() -> AnyObject?
    var webView: WKWebView? { get }
    func reload()
}

@available(iOS 13.0, *)
@objc public class CapacitorMeteorWebApp: NSObject, AssetBundleManagerDelegate {

    // MARK: - Properties

    /// Persistent configuration settings for the webapp
    private(set) var configuration: WebAppConfiguration!

    /// The asset bundle manager handles downloading and managing bundles
    private(set) var assetBundleManager: AssetBundleManager!

    /// The asset bundle currently used to serve assets from
    private var currentAssetBundle: AssetBundle! {
        didSet {
            updateConfigurationWithCurrentBundle()
        }
    }

    /// Downloaded asset bundles are considered pending until the next page reload
    /// because we don't want the app to end up in an inconsistent state by
    /// loading assets from different bundles.
    private var pendingAssetBundle: AssetBundle?

    /// Timer used to wait for startup to complete after a reload
    private var startupTimer: Timer?

    /// The number of seconds to wait for startup to complete, after which
    /// we revert to the last known good version
    private var startupTimeoutInterval: TimeInterval = 30.0

    /// Serial queue to prevent concurrent bundle switches
    private let bundleSwitchQueue = DispatchQueue(
        label: "com.meteor.webapp.bundle-switch", qos: .userInitiated)

    /// Logger for this module
    private let logger = os.Logger(
        subsystem: "com.meteor.webapp", category: "CapacitorMeteorWebApp")

    /// The www directory in the app bundle
    private var wwwDirectoryURL: URL!

    /// Reference to Capacitor bridge for bundle switching
    private weak var capacitorBridge: CapacitorBridge?

    /// Track if we switched to a new version (for startup timer)
    private var switchedToNewVersion = false

    /// Startup timer deadline while running in foreground
    private var startupTimerDeadline: Date?

    /// Remaining startup timeout while paused/backgrounded
    private var startupTimerRemainingInterval: TimeInterval?

    /// Directory for serving organized bundles
    private var servingDirectoryURL: URL!

    // MARK: - Initialization

    init(capacitorBridge: CapacitorBridge? = nil) {
        super.init()

        self.capacitorBridge = capacitorBridge

        // Initialize configuration
        configuration = WebAppConfiguration()

        // Set www directory URL - check if it exists first
        guard let resourceURL = Bundle.main.resourceURL else {
            logger.error("Could not get main bundle resource URL")
            return
        }

        // Capacitor typically uses 'public' but fall back to 'www' if needed
        let publicURL = resourceURL.appendingPathComponent("public")
        let wwwURL = resourceURL.appendingPathComponent("www")

        if FileManager.default.fileExists(atPath: publicURL.path) {
            wwwDirectoryURL = publicURL
        } else if FileManager.default.fileExists(atPath: wwwURL.path) {
            wwwDirectoryURL = wwwURL
            logger.info("Using www directory instead of public")
        } else {
            logger.error("Neither public nor www directory exists in bundle")
            return
        }

        // Initialize asset bundles
        do {
            try initializeAssetBundles()
        } catch {
            logger.error("Failed to initialize asset bundles: \(error.localizedDescription)")
        }

        // Setup startup timer
        setupStartupTimer()

        registerLifecycleObservers()
    }

    /// Test-only initializer that bypasses Bundle.main resource discovery and
    /// allows deterministic lifecycle testing with injected dependencies.
    init(
        capacitorBridge: CapacitorBridge?,
        configuration: WebAppConfiguration,
        assetBundleManager: AssetBundleManager,
        currentAssetBundle: AssetBundle,
        pendingAssetBundle: AssetBundle? = nil,
        servingDirectoryURL: URL,
        startupTimeoutInterval: TimeInterval = 30.0
    ) {
        super.init()

        self.capacitorBridge = capacitorBridge
        self.configuration = configuration
        self.assetBundleManager = assetBundleManager
        self.servingDirectoryURL = servingDirectoryURL
        self.startupTimeoutInterval = startupTimeoutInterval

        self.currentAssetBundle = currentAssetBundle
        self.pendingAssetBundle = pendingAssetBundle

        self.assetBundleManager.delegate = self
        setupStartupTimer()
        setupCurrentBundle()
        registerLifecycleObservers()
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    private func selectCurrentAssetBundle(initialAssetBundle: AssetBundle) {
        // If a last downloaded version has been set and the asset bundle exists,
        // we set it as the current asset bundle
        if let lastDownloadedVersion = configuration.lastDownloadedVersion,
           let downloadedAssetBundle = assetBundleManager.downloadedAssetBundleWithVersion(
            lastDownloadedVersion) {
            logger.info("📦 Using downloaded asset bundle version: \(lastDownloadedVersion)")
            currentAssetBundle = downloadedAssetBundle
            if configuration.lastKnownGoodVersion != lastDownloadedVersion {
                startStartupTimer()
            }
        } else {
            if let lastDownloadedVersion = configuration.lastDownloadedVersion {
                logger.warning(
                    "⚠️ Downloaded version \(lastDownloadedVersion) was configured but bundle not found, falling back to initial bundle"
                )
            }
            logger.info("📦 Using initial asset bundle version: \(initialAssetBundle.version)")
            currentAssetBundle = initialAssetBundle
        }
    }

    private func initializeAssetBundles() throws {
        assetBundleManager = nil

        // The initial asset bundle consists of the assets bundled with the app
        guard let wwwURL = wwwDirectoryURL else {
            throw HotCodePushError.initializationFailed(reason: "www directory URL not set")
        }

        let initialAssetBundle: AssetBundle
        do {
            initialAssetBundle = try AssetBundle(directoryURL: wwwURL)
        } catch {
            throw HotCodePushError.initializationFailed(
                reason: "Could not load initial asset bundle: \(error.localizedDescription)")
        }

        let fileManager = FileManager.default

        // Downloaded versions are stored in Library/NoCloud/meteor
        guard
            let libraryDirectoryURL = FileManager.default.urls(
                for: .libraryDirectory, in: .userDomainMask
            ).first
        else {
            throw HotCodePushError.initializationFailed(
                reason: "Could not get library directory URL")
        }
        let versionsDirectoryURL = libraryDirectoryURL.appendingPathComponent("NoCloud/meteor")

        // Serving directory for organized bundles
        servingDirectoryURL = libraryDirectoryURL.appendingPathComponent("NoCloud/meteor-serving")

        // If the last seen initial version is different from the currently bundled
        // version, we delete the versions directory and reset configuration
        if configuration.lastSeenInitialVersion != initialAssetBundle.version {
            do {
                if fileManager.fileExists(atPath: versionsDirectoryURL.path) {
                    try fileManager.removeItem(at: versionsDirectoryURL)
                }
                if fileManager.fileExists(atPath: servingDirectoryURL.path) {
                    try fileManager.removeItem(at: servingDirectoryURL)
                }
            } catch {
                logger.error("Could not remove versions directory: \(error.localizedDescription)")
            }

            configuration.reset()
        }

        // We keep track of the last seen initial version
        configuration.lastSeenInitialVersion = initialAssetBundle.version

        // Create directories if they don't exist
        do {
            if !fileManager.fileExists(atPath: versionsDirectoryURL.path) {
                try fileManager.createDirectory(
                    at: versionsDirectoryURL, withIntermediateDirectories: true, attributes: nil)
            }
            if !fileManager.fileExists(atPath: servingDirectoryURL.path) {
                try fileManager.createDirectory(
                    at: servingDirectoryURL, withIntermediateDirectories: true, attributes: nil)
            }
        } catch {
            throw HotCodePushError.initializationFailed(
                reason: "Could not create directories: \(error.localizedDescription)")
        }

        assetBundleManager = AssetBundleManager(
            configuration: configuration, versionsDirectoryURL: versionsDirectoryURL,
            initialAssetBundle: initialAssetBundle)
        assetBundleManager.delegate = self

        // Select bundle AFTER validation (configuration.lastDownloadedVersion may have been cleared)
        selectCurrentAssetBundle(initialAssetBundle: initialAssetBundle)

        pendingAssetBundle = nil

        // Organize and serve the current bundle
        setupCurrentBundle()
    }

    private func setupStartupTimer() {
        startupTimer = Timer(queue: DispatchQueue.global(qos: .utility)) { [weak self] in
            self?.startupTimerDeadline = nil
            self?.startupTimerRemainingInterval = nil
            self?.logger.error("App startup timed out, reverting to last known good version")
            self?.revertToLastKnownGoodVersion()
        }
    }

    private func registerLifecycleObservers() {
        // Stop startup timer when backgrounded to avoid false positives while suspended.
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(onApplicationDidEnterBackground),
            name: UIApplication.didEnterBackgroundNotification,
            object: nil
        )

        // Resume any paused startup timer when returning to foreground.
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(onApplicationWillEnterForeground),
            name: UIApplication.willEnterForegroundNotification,
            object: nil
        )
    }

    private func updateConfigurationWithCurrentBundle() {
        guard let currentBundle = currentAssetBundle else { return }

        configuration.appId = currentBundle.appId
        configuration.rootURL = currentBundle.rootURL
        configuration.cordovaCompatibilityVersion = currentBundle.cordovaCompatibilityVersion
    }

    private func setupCurrentBundle() {
        guard let currentAssetBundle = currentAssetBundle else { return }

        do {
            let bundleServingDirectory = servingDirectoryURL.appendingPathComponent(
                currentAssetBundle.version)

            // Remove existing serving directory for this version
            if FileManager.default.fileExists(atPath: bundleServingDirectory.path) {
                try FileManager.default.removeItem(at: bundleServingDirectory)
            }

            // Organize the bundle for serving
            try BundleOrganizer.organizeBundle(currentAssetBundle, in: bundleServingDirectory)

            // Set Capacitor's server base path to serve from organized bundle
            setServerBasePath(bundleServingDirectory)

            // Clean up old serving directories to prevent disk space leak.
            // Only the current version's directory is needed.
            cleanupOldServingDirectories(keeping: currentAssetBundle.version)

        } catch let webAppError as WebAppError {
            logger.error("Could not setup current bundle (WebAppError): \(webAppError.description)")
        } catch {
            logger.error("Could not setup current bundle: \(error.localizedDescription)")
        }
    }

    private func cleanupOldServingDirectories(keeping currentVersion: String) {
        let fileManager = FileManager.default
        guard let contents = try? fileManager.contentsOfDirectory(
            at: servingDirectoryURL, includingPropertiesForKeys: nil) else { return }

        for item in contents {
            if item.lastPathComponent != currentVersion {
                do {
                    try fileManager.removeItem(at: item)
                } catch {
                    logger.warning(
                        "Could not remove old serving directory \(item.lastPathComponent): \(error.localizedDescription)"
                    )
                }
            }
        }
    }

    private func setServerBasePath(_ path: URL) {
        guard let bridge = capacitorBridge else {
            logger.error("No Capacitor bridge available for setting server base path")
            return
        }

        // Use Capacitor's setServerBasePath to change serving directory
        // Must be called on main thread
        DispatchQueue.main.async {
            bridge.setServerBasePath(path.path)
        }
    }

    private func startStartupTimer() {
        DispatchQueue.main.async {
            let interval = self.startupTimerRemainingInterval ?? self.startupTimeoutInterval

            // Don't start the startup timer while backgrounded, but preserve remaining time.
            if UIApplication.shared.applicationState != .active {
                self.startupTimerRemainingInterval = interval
                self.startupTimerDeadline = nil
                return
            }

            if interval <= 0 {
                self.startupTimerRemainingInterval = nil
                self.startupTimerDeadline = nil
                self.revertToLastKnownGoodVersion()
                return
            }

            self.logger.info("App startup timer started")
            self.startupTimerRemainingInterval = interval
            self.startupTimerDeadline = Date().addingTimeInterval(interval)
            self.startupTimer?.start(withTimeInterval: interval)
        }
    }

    // MARK: - Public Methods

    /**
     * Check for available updates from the Meteor server
     */
    public func checkForUpdates(completion: @escaping (Error?) -> Void) {
        guard let rootURL = configuration.rootURL else {
            let error = HotCodePushError.noRootURLConfigured
            completion(error)
            return
        }

        let baseURL = rootURL.appendingPathComponent("__cordova/")
        assetBundleManager.checkForUpdatesWithBaseURL(baseURL)

        // Note: Actual completion will be called through delegate methods
        completion(nil)
    }

    /**
     * Check for available updates from the Meteor server (async version)
     */
    public func checkForUpdates() async throws {
        return try await withCheckedThrowingContinuation { continuation in
            checkForUpdates { error in
                if let error = error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume()
                }
            }
        }
    }

    /**
     * Notify the plugin that app startup is complete
     */
    public func startupDidComplete(completion: @escaping (Error?) -> Void) {
        logger.info("App startup completed for bundle \(self.currentAssetBundle.version)")
        startupTimer?.stop()
        startupTimerDeadline = nil
        startupTimerRemainingInterval = nil

        // If startup completed successfully, we consider a version good
        configuration.lastKnownGoodVersion = currentAssetBundle.version

        // Clean up old asset bundles in the background
        DispatchQueue.global(qos: .utility).async { [weak self] in
            guard let self = self else { return }
            do {
                try self.assetBundleManager.removeAllDownloadedAssetBundlesExceptFor(
                    self.currentAssetBundle)
            } catch {
                self.logger.error(
                    "Could not remove unused asset bundles: \(error.localizedDescription)")
            }
        }

        completion(nil)
    }

    /**
     * Notify the plugin that app startup is complete (async version)
     */
    public func startupDidComplete() async throws {
        return try await withCheckedThrowingContinuation { continuation in
            startupDidComplete { error in
                if let error = error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume()
                }
            }
        }
    }

    /**
     * Get the current app version
     */
    public func getCurrentVersion() -> String {
        return currentAssetBundle?.version ?? "unknown"
    }

    /**
     * Check if an update is available and ready to install
     */
    public func isUpdateAvailable() -> Bool {
        return pendingAssetBundle != nil
    }

    /**
     * Reload the app with the latest available version
     */
    public func reload(completion: @escaping (Error?) -> Void) {
        bundleSwitchQueue.async { [weak self] in
            guard let self = self else {
                DispatchQueue.main.async {
                    completion(HotCodePushError.bridgeUnavailable)
                }
                return
            }

            self._performReload(completion: completion)
        }
    }

    private func _performReload(completion: @escaping (Error?) -> Void) {
        // If there is a pending asset bundle, we switch to it atomically
        guard let pendingAssetBundle = pendingAssetBundle else {
            DispatchQueue.main.async {
                completion(HotCodePushError.noPendingVersion)
            }
            return
        }

        logger.info("Switching to pending version \(pendingAssetBundle.version)")

        do {
            // Organize the pending bundle for serving
            let bundleServingDirectory = servingDirectoryURL.appendingPathComponent(
                pendingAssetBundle.version)

            // Remove existing serving directory for this version
            if FileManager.default.fileExists(atPath: bundleServingDirectory.path) {
                try FileManager.default.removeItem(at: bundleServingDirectory)
            }

            // Organize the bundle
            try BundleOrganizer.organizeBundle(pendingAssetBundle, in: bundleServingDirectory)

            // Make atomic switch
            currentAssetBundle = pendingAssetBundle
            self.pendingAssetBundle = nil
            switchedToNewVersion = true

            // Set new server base path (this will dispatch to main thread)
            setServerBasePath(bundleServingDirectory)

            // Reload the WebView (this will dispatch to main thread)
            reloadWebView()

            // Start startup timer to track successful loading
            startStartupTimer()

            DispatchQueue.main.async {
                completion(nil)
            }

        } catch {
            let hotCodePushError = HotCodePushError.bundleOrganizationFailed(
                reason: "Failed to organize bundle for version \(pendingAssetBundle.version)",
                underlyingError: error
            )
            DispatchQueue.main.async {
                completion(hotCodePushError)
            }
        }
    }

    /**
     * Reload the app with the latest available version (async version)
     */
    public func reload() async throws {
        return try await withCheckedThrowingContinuation { continuation in
            reload { error in
                if let error = error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume()
                }
            }
        }
    }

    private func reloadWebView() {
        guard let bridge = capacitorBridge else {
            logger.error("Could not get Capacitor bridge for reload")
            return
        }

        DispatchQueue.main.async {
            bridge.reload()
        }
    }

    // MARK: - Recovery and Error Handling

    private func revertToLastKnownGoodVersion() {
        bundleSwitchQueue.async { [weak self] in
            self?._performRevertToLastKnownGoodVersion()
        }
    }

    private func _performRevertToLastKnownGoodVersion() {

        // Blacklist the current version, so we don't update to it again right away
        configuration.addBlacklistedVersion(currentAssetBundle.version)

        // If there is a last known good version and we can load the bundle, revert to it
        if let lastKnownGoodVersion = configuration.lastKnownGoodVersion,
           let lastKnownGoodAssetBundle = assetBundleManager.downloadedAssetBundleWithVersion(
            lastKnownGoodVersion) {
            pendingAssetBundle = lastKnownGoodAssetBundle
            // Else, revert to the initial asset bundle, unless that is what we are currently serving
        } else if currentAssetBundle.version != assetBundleManager.initialAssetBundle.version {
            pendingAssetBundle = assetBundleManager.initialAssetBundle
        }

        // Only reload if we have a pending asset bundle to reload
        if pendingAssetBundle != nil {
            forceReload()
        } else {
            logger.warning("There is no last good version we can revert to")
        }
    }

    private func forceReload() {
        // Swap pending bundle to current before reload.
        // In Cordova, the framework called onReset() before each reload which
        // performed this swap. Capacitor has no equivalent hook, so we do it
        // explicitly here.
        if let pending = pendingAssetBundle {
            currentAssetBundle = pending
            pendingAssetBundle = nil
        }

        // Re-organize and set server base path for the (possibly new) current bundle
        setupCurrentBundle()

        guard let bridge = capacitorBridge else {
            logger.error("Could not get Capacitor bridge for force reload")
            return
        }

        DispatchQueue.main.async {
            if let webView = bridge.webView {
                webView.reloadFromOrigin()
            } else {
                // Fallback to regular reload if webView is not available
                bridge.reload()
            }
        }
    }

    // MARK: - Lifecycle Handling

    public func onPageReload() {
        // If there is a pending asset bundle, we make it the current
        if let pendingAssetBundle = pendingAssetBundle {
            currentAssetBundle = pendingAssetBundle
            self.pendingAssetBundle = nil
        }

        if switchedToNewVersion {
            switchedToNewVersion = false
            startStartupTimer()
        }
    }

    @objc public func onApplicationDidEnterBackground() {
        DispatchQueue.main.async {
            // Stop startup timer when backgrounded, but preserve remaining interval
            // so we can resume when returning to foreground.
            if let deadline = self.startupTimerDeadline {
                self.startupTimerRemainingInterval = max(0, deadline.timeIntervalSinceNow)
                self.startupTimerDeadline = nil
                self.startupTimer?.stop()
            }
        }
    }

    @objc public func onApplicationWillEnterForeground() {
        DispatchQueue.main.async {
            guard self.startupTimerDeadline == nil, self.startupTimerRemainingInterval != nil else {
                return
            }
            self.startStartupTimer()
        }
    }

    // MARK: - Testing Helpers

    /// Triggers the same recovery flow used by startup timeout handling.
    func triggerStartupTimeoutForTesting() {
        revertToLastKnownGoodVersion()
    }

    // MARK: - AssetBundleManagerDelegate

    func assetBundleManager(
        _ assetBundleManager: AssetBundleManager,
        shouldDownloadBundleForManifest manifest: AssetManifest
    ) -> Bool {
        // No need to redownload the current or the pending version
        if currentAssetBundle.version == manifest.version
            || pendingAssetBundle?.version == manifest.version {
            return false
        }

        // Don't download blacklisted versions
        if configuration.blacklistedVersions.contains(manifest.version) {
            logger.info("Skipping blacklisted version: \(manifest.version)")
            notifyUpdateFailed(error: WebAppError.unsuitableAssetBundle(
                reason: "Skipping downloading blacklisted version",
                underlyingError: nil))
            return false
        }

        // Don't download versions potentially incompatible with the bundled native code
        if manifest.cordovaCompatibilityVersion != configuration.cordovaCompatibilityVersion {
            logger.info("Skipping incompatible version: \(manifest.version)")
            notifyUpdateFailed(error: WebAppError.unsuitableAssetBundle(
                reason: "Skipping downloading new version because the Cordova platform version or plugin versions have changed and are potentially incompatible",
                underlyingError: nil))
            return false
        }

        return true
    }

    func assetBundleManager(
        _ assetBundleManager: AssetBundleManager,
        didFinishDownloadingBundle assetBundle: AssetBundle
    ) {
        logger.info("Finished downloading new asset bundle version: \(assetBundle.version)")

        configuration.lastDownloadedVersion = assetBundle.version
        pendingAssetBundle = assetBundle

        // Notify any listeners that a new version is ready
        notifyUpdateAvailable(version: assetBundle.version)
    }

    func assetBundleManager(
        _ assetBundleManager: AssetBundleManager, didFailDownloadingBundleWithError error: Error
    ) {
        logger.error("Download failure: \(error.localizedDescription)")
        notifyUpdateFailed(error: error)
    }

    // MARK: - Event Notifications

    private func notifyUpdateAvailable(version: String) {
        // Notify the Capacitor plugin bridge about update availability
        NotificationCenter.default.post(
            name: .meteorWebappUpdateAvailable,
            object: nil,
            userInfo: ["version": version]
        )
    }

    private func notifyUpdateFailed(error: Error) {
        // Notify the Capacitor plugin bridge about update failure
        NotificationCenter.default.post(
            name: .meteorWebappUpdateFailed,
            object: nil,
            userInfo: ["error": error.localizedDescription]
        )
    }
}
