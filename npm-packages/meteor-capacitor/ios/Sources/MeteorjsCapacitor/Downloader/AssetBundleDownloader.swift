// Vendored from https://github.com/banjerluke/capacitor-meteor-webapp
// Copyright 2025 Luke Abbott. MIT license. See LICENSES/banjerluke-capacitor-meteor-webapp.txt.

//
// AssetBundleDownloader.swift
//
// Handles downloading of Meteor app asset bundles over HTTP with
// support for retry logic, error handling, and progress tracking.
//
// This file is copied directly from cordova-plugin-meteor-webapp with
// minimal changes to adapt for Capacitor.
//

import UIKit
import os.log

protocol AssetBundleDownloaderDelegate: AnyObject {
    func assetBundleDownloaderDidFinish(_ assetBundleDownloader: AssetBundleDownloader)
    func assetBundleDownloader(
        _ assetBundleDownloader: AssetBundleDownloader, didFailWithError error: Error)
}

final class AssetBundleDownloader: NSObject, URLSessionDelegate, URLSessionTaskDelegate,
                                   URLSessionDataDelegate, URLSessionDownloadDelegate, NetworkReachabilityManagerDelegate {
    private let logger = os.Logger(
        subsystem: "com.meteor.webapp", category: "AssetBundleDownloader")

    private(set) var configuration: WebAppConfiguration
    private(set) var assetBundle: AssetBundle
    private(set) var baseURL: URL

    weak var delegate: AssetBundleDownloaderDelegate?

    /// A private serial queue used to synchronize access
    private let queue: DispatchQueue

    private let fileManager = FileManager()

    private var session: Foundation.URLSession!

    private var missingAssets: Set<Asset>
    private var assetsDownloadingByTaskIdentifier = [Int: Asset]()
    private var resumeDataByAsset = [Asset: Data]()

    private var retryStrategy: RetryStrategy
    private var numberOfRetryAttempts: UInt = 0
    private var resumeTimer: Timer!
    private var networkReachabilityManager: NetworkReachabilityManager?

    enum Status {
        case suspended
        case running
        case waiting
        case canceling
        case invalid
    }

    private var status: Status = .suspended

    private var backgroundTask: UIBackgroundTaskIdentifier = UIBackgroundTaskIdentifier.invalid

    init(
        configuration: WebAppConfiguration, assetBundle: AssetBundle, baseURL: URL,
        missingAssets: Set<Asset>, sessionConfiguration: URLSessionConfiguration = .default
    ) {
        self.configuration = configuration
        self.assetBundle = assetBundle
        self.baseURL = baseURL
        self.missingAssets = missingAssets

        queue = DispatchQueue(label: "com.meteor.webapp.AssetBundleDownloader", attributes: [])

        retryStrategy = RetryStrategy()

        super.init()

        sessionConfiguration.httpMaximumConnectionsPerHost = 6

        // Disable the protocol-level local cache, because we make sure to only
        // download changed files, so there is no need to waste additional storage
        sessionConfiguration.urlCache = nil
        sessionConfiguration.requestCachePolicy = .reloadIgnoringLocalCacheData

        let operationQueue = OperationQueue()
        operationQueue.maxConcurrentOperationCount = 1
        operationQueue.underlyingQueue = queue

        session = Foundation.URLSession(
            configuration: sessionConfiguration, delegate: self, delegateQueue: operationQueue)

        resumeTimer = Timer(queue: queue) { [weak self] in
            self?.resume()
        }

        if #available(macOS 10.14, iOS 12.0, *) {
            networkReachabilityManager = NetworkReachabilityManager()
            networkReachabilityManager?.delegate = self
            networkReachabilityManager?.delegateQueue = queue
            _ = networkReachabilityManager?.startMonitoring()
        }

        NotificationCenter.default.addObserver(
            self, selector: #selector(AssetBundleDownloader.applicationWillEnterForeground),
            name: UIApplication.willEnterForegroundNotification, object: nil)
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    func resume() {
        queue.async {
            if self.backgroundTask == UIBackgroundTaskIdentifier.invalid {
                NSLog("Start downloading assets from bundle with version: \(self.assetBundle.version)")

                let application = UIApplication.shared
                self.backgroundTask = application.beginBackgroundTask(withName: "AssetBundleDownload") {
                    // Expiration handler, usually invoked 180 seconds after the app goes
                    // into the background
                    NSLog("AssetBundleDownload task expired, app is suspending")
                    self.status = .suspended
                    self.endBackgroundTask()
                }
            }

            self.status = .running

            let assetsDownloading = Set(self.assetsDownloadingByTaskIdentifier.values)

            for asset in self.missingAssets {
                if assetsDownloading.contains(asset) { continue }

                let task: URLSessionTask

                // If we have previously stored resume data, use that to recreate the
                // task
                if let resumeData = self.resumeDataByAsset.removeValue(forKey: asset) {
                    task = self.session.downloadTask(withResumeData: resumeData)
                } else {
                    guard let URL = self.downloadURLForAsset(asset) else {
                        self.cancelAndFailWithReason("Invalid URL for asset: \(asset)")
                        return
                    }

                    task = self.session.dataTask(with: URL)
                }

                self.assetsDownloadingByTaskIdentifier[task.taskIdentifier] = asset
                task.resume()
            }
        }
    }

    private func resumeLater() {
        if status == .running {
            let retryInterval = retryStrategy.retryIntervalForNumber(ofAttempts: numberOfRetryAttempts)
            NSLog("Will retry resuming downloads after %f seconds", retryInterval)
            resumeTimer.start(withTimeInterval: retryInterval)
            numberOfRetryAttempts += 1
            status = .waiting
        }
    }

    private func downloadURLForAsset(_ asset: Asset) -> URL? {
        var urlPath = asset.urlPath

        // Remove leading / from URL path because the path should be relative to the base URL
        if urlPath.hasPrefix("/") {
            urlPath = String(asset.urlPath.dropFirst())
        }

        // For the root/index page, return the base URL directly.
        // URLComponents(string: "") can produce unreliable results across
        // Foundation versions when resolved relative to a base URL.
        if urlPath.isEmpty {
            return baseURL
        }

        guard var urlComponents = URLComponents(string: urlPath) else {
            return nil
        }

        // To avoid inadvertently downloading the default index page when an asset
        // is not found, we add meteor_dont_serve_index=true to the URL unless we
        // are actually downloading the index page.
        if asset.filePath != "index.html" {
            let queryItem = URLQueryItem(name: "meteor_dont_serve_index", value: "true")
            if var queryItems = urlComponents.queryItems {
                queryItems.append(queryItem)
                urlComponents.queryItems = queryItems
            } else {
                urlComponents.queryItems = [queryItem]
            }
        }

        return urlComponents.url(relativeTo: baseURL)
    }

    private func endBackgroundTask() {
        let application = UIApplication.shared
        if backgroundTask != UIBackgroundTaskIdentifier.invalid {
            application.endBackgroundTask(backgroundTask)
            self.backgroundTask = UIBackgroundTaskIdentifier.invalid
        }
    }

    func cancel() {
        queue.sync {
            self._cancel()
        }
    }

    private func _cancel() {
        if self.status != .canceling || self.status == .invalid {
            self.status = .canceling
            self.session.invalidateAndCancel()
            self.endBackgroundTask()
        }
    }

    private func cancelAndFailWithReason(_ reason: String, underlyingError: Error? = nil) {
        let error = WebAppError.downloadFailure(reason: reason, underlyingError: underlyingError)
        logger.error("Download failure - Reason: \(reason)")
        if let underlyingError = underlyingError {
            logger.error("Underlying error: \(underlyingError)")
        }
        cancelAndFailWithError(error)
    }

    private func cancelAndFailWithError(_ error: Error) {
        logger.error("Download failed with error: \(error)")
        _cancel()
        delegate?.assetBundleDownloader(self, didFailWithError: error)
    }

    private func didFinish() {
        session.finishTasksAndInvalidate()
        delegate?.assetBundleDownloaderDidFinish(self)
        endBackgroundTask()
    }

    // MARK: Application State Notifications

    @objc func applicationWillEnterForeground() {
        if status == .suspended {
            resume()
        }
    }

    // MARK: NetworkReachabilityManagerDelegate

    @available(macOS 10.14, iOS 12.0, *)
    func networkReachabilityManager(
        _ reachabilityManager: NetworkReachabilityManager,
        didDetectReachabilityStatusChange reachabilityStatus: NetworkReachabilityStatus
    ) {

        if reachabilityStatus == .reachable && status == .waiting {
            resume()
        }
    }

    // MARK: URLSessionDelegate

    func urlSession(_ session: URLSession, didBecomeInvalidWithError error: Error?) {
        status = .invalid
    }

    func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
    }

    // MARK: URLSessionTaskDelegate

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        if let error = error {
            if let asset = assetsDownloadingByTaskIdentifier.removeValue(forKey: task.taskIdentifier) {
                if task is URLSessionDownloadTask && status != .canceling {
                    NSLog("Download of asset: \(asset) did fail with error: \(error)")

                    // If there is resume data, we store it and use it to recreate the task later
                    if let resumeData = (error as NSError).userInfo[NSURLSessionDownloadTaskResumeData]
                        as? Data {
                        resumeDataByAsset[asset] = resumeData
                    }
                    resumeLater()
                }
            }
        }
    }

    // MARK: URLSessionDataDelegate

    func urlSession(
        _ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse,
        completionHandler: @escaping (URLSession.ResponseDisposition) -> Void
    ) {
        if status == .canceling {
            completionHandler(.cancel)
            return
        }

        guard let response = response as? HTTPURLResponse else {
            completionHandler(.cancel)
            return
        }

        if let asset = assetsDownloadingByTaskIdentifier[dataTask.taskIdentifier] {
            do {
                try verifyResponse(response, forAsset: asset)

                // Check if this was a 404 for a source map that we're ignoring
                if let httpResponse = response as? HTTPURLResponse,
                   httpResponse.statusCode == 404
                    && (asset.urlPath.hasSuffix(".map") || asset.fileURL.pathExtension == "map") {
                    // Mark this asset as complete and don't download
                    assetsDownloadingByTaskIdentifier.removeValue(forKey: dataTask.taskIdentifier)
                    missingAssets.remove(asset)
                    if missingAssets.isEmpty {
                        didFinish()
                    }
                    completionHandler(.cancel)
                } else {
                    completionHandler(.becomeDownload)
                }
            } catch {
                completionHandler(.cancel)
                self.cancelAndFailWithError(error)
            }
        } else {
            // No asset found for this task
            completionHandler(.cancel)
        }
    }

    func urlSession(
        _ session: URLSession, dataTask: URLSessionDataTask,
        didBecome downloadTask: URLSessionDownloadTask
    ) {
        if let asset = assetsDownloadingByTaskIdentifier.removeValue(forKey: dataTask.taskIdentifier) {
            assetsDownloadingByTaskIdentifier[downloadTask.taskIdentifier] = asset
        }
    }

    // MARK: URLSessionDownloadDelegate

    func urlSession(
        _ session: URLSession, downloadTask: URLSessionDownloadTask,
        didResumeAtOffset fileOffset: Int64, expectedTotalBytes: Int64
    ) {
        if status == .canceling { return }

        guard let response = downloadTask.response as? HTTPURLResponse else { return }

        if let asset = assetsDownloadingByTaskIdentifier[downloadTask.taskIdentifier] {
            do {
                try verifyResponse(response, forAsset: asset)
            } catch {
                self.cancelAndFailWithError(error)
            }
        }
    }

    func urlSession(
        _ session: URLSession, downloadTask: URLSessionDownloadTask,
        didFinishDownloadingTo location: URL
    ) {
        if let asset = assetsDownloadingByTaskIdentifier.removeValue(
            forKey: downloadTask.taskIdentifier) {
            if status == .canceling { return }

            // We don't have a hash for the index page, so we have to parse the runtime config
            // and compare autoupdateVersionCordova to the version in the manifest to verify
            // if we downloaded the expected version
            if asset.filePath == "index.html" {
                do {
                    let runtimeConfig = try loadRuntimeConfigFromIndexFileAtURL(location)
                    try verifyRuntimeConfig(runtimeConfig)
                } catch {
                    self.cancelAndFailWithError(error)
                    return
                }
            }

            do {
                try fileManager.moveItem(at: location, to: asset.fileURL)
            } catch {
                self.cancelAndFailWithReason("Could not move downloaded asset", underlyingError: error)
                return
            }

            missingAssets.remove(asset)

            if missingAssets.isEmpty {
                didFinish()
            }
        }
    }

    private func verifyResponse(_ response: HTTPURLResponse, forAsset asset: Asset) throws {
        // A response with a non-success status code should not be considered a succesful download
        if !response.isSuccessful {
            // Allow 404s for source map files since they may not be served in production
            if response.statusCode == 404
                && (asset.urlPath.hasSuffix(".map") || asset.fileURL.pathExtension == "map") {
                return  // Don't throw error, just skip this file
            }

            logger.error("Non-success status code: \(response.statusCode)")
            throw WebAppError.downloadFailure(
                reason: "Non-success status code \(response.statusCode) for asset: \(asset)",
                underlyingError: nil)
            // If we have a hash for the asset, and the ETag header also specifies
            // a hash, we compare these to verify if we received the expected asset version
        } else if let expectedHash = asset.hash,
                  // TODO: allHeaderFields should be case insensitive, but now requires 'Etag'
                  // This appears to be s Swift bug (see https://bugs.swift.org/browse/SR-2429)
                  let ETag = response.allHeaderFields["Etag"] as? String,
                  let actualHash = SHA1HashFromETag(ETag),
                  actualHash != expectedHash {
            logger.error("Hash mismatch - Expected: \(expectedHash), Actual: \(actualHash)")
            throw WebAppError.downloadFailure(
                reason: "Hash mismatch for asset: \(asset)", underlyingError: nil)
        }
    }

    private func verifyRuntimeConfig(_ runtimeConfig: AssetBundle.RuntimeConfig) throws {
        let expectedVersion = assetBundle.version
        if let actualVersion = runtimeConfig.autoupdateVersionCordova,
           expectedVersion != actualVersion {
            throw WebAppError.downloadFailure(
                reason:
                    "Version mismatch for index page, expected: \(expectedVersion), actual: \(actualVersion)",
                underlyingError: nil)
        }

        guard let rootURL = runtimeConfig.rootURL else {
            throw WebAppError.unsuitableAssetBundle(
                reason: "Could not find ROOT_URL in downloaded asset bundle", underlyingError: nil)
        }

        if configuration.rootURL?.host != "localhost" && rootURL.host == "localhost" {
            throw WebAppError.unsuitableAssetBundle(
                reason:
                    "ROOT_URL in downloaded asset bundle would change current ROOT_URL to localhost. Make sure ROOT_URL has been configured correctly on the server.",
                underlyingError: nil)
        }

        guard let appId = runtimeConfig.appId else {
            throw WebAppError.unsuitableAssetBundle(
                reason: "Could not find appId in downloaded asset bundle", underlyingError: nil)
        }

        if appId != configuration.appId {
            throw WebAppError.unsuitableAssetBundle(
                reason:
                    "appId in downloaded asset bundle does not match current appId. Make sure the server at \(rootURL) is serving the right app.",
                underlyingError: nil)
        }
    }
}
