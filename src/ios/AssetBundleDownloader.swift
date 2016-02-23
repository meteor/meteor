protocol AssetBundleDownloaderDelegate: class {
  func assetBundleDownloaderDidFinish(assetBundleDownloader: AssetBundleDownloader)
  func assetBundleDownloader(assetBundleDownloader: AssetBundleDownloader, didFailWithError error: ErrorType)
}

final class AssetBundleDownloader: NSObject, NSURLSessionDelegate, NSURLSessionTaskDelegate, NSURLSessionDataDelegate, NSURLSessionDownloadDelegate, METNetworkReachabilityManagerDelegate {
  private(set) var configuration: WebAppConfiguration
  private(set) var assetBundle: AssetBundle
  private(set) var baseURL: NSURL

  weak var delegate: AssetBundleDownloaderDelegate?

  /// A private serial queue used to synchronize access
  private let queue: dispatch_queue_t

  private let fileManager = NSFileManager()

  private var session: NSURLSession!

  private var missingAssets: Set<Asset>
  private var assetsDownloadingByTaskIdentifier = [Int: Asset]()
  private var resumeDataByAsset = [Asset: NSData]()

  private var retryStrategy: METRetryStrategy
  private var numberOfRetryAttempts: UInt = 0
  private var resumeTimer: METTimer!
  private var networkReachabilityManager: METNetworkReachabilityManager!

  enum Status {
    case Suspended
    case Running
    case Waiting
    case Canceling
    case Invalid
  }

  private var status: Status = .Suspended

  private var backgroundTask: UIBackgroundTaskIdentifier = UIBackgroundTaskInvalid

  init(configuration: WebAppConfiguration, assetBundle: AssetBundle, baseURL: NSURL, missingAssets: Set<Asset>) {
    self.configuration = configuration
    self.assetBundle = assetBundle
    self.baseURL = baseURL
    self.missingAssets = missingAssets

    queue = dispatch_queue_create("com.meteor.webapp.AssetBundleDownloader", nil)

    retryStrategy = METRetryStrategy()
    retryStrategy.minimumTimeInterval = 0.1
    retryStrategy.numberOfAttemptsAtMinimumTimeInterval = 2
    retryStrategy.baseTimeInterval = 1
    retryStrategy.exponent = 2.2
    retryStrategy.randomizationFactor = 0.5

    super.init()

    let sessionConfiguration = NSURLSessionConfiguration.defaultSessionConfiguration()
    sessionConfiguration.HTTPMaximumConnectionsPerHost = 6

    // Disable the protocol-level local cache, because we make sure to only
    // download changed files, so there is no need to waste additional storage
    sessionConfiguration.URLCache = nil
    sessionConfiguration.requestCachePolicy = .ReloadIgnoringLocalCacheData

    let operationQueue = NSOperationQueue()
    operationQueue.maxConcurrentOperationCount = 1
    operationQueue.underlyingQueue = queue

    session = NSURLSession(configuration: sessionConfiguration, delegate: self, delegateQueue: operationQueue)

    resumeTimer = METTimer(queue: queue) { [weak self] in
      self?.resume()
    }

    networkReachabilityManager = METNetworkReachabilityManager(hostName: baseURL.host!)
    networkReachabilityManager.delegate = self
    networkReachabilityManager.delegateQueue = queue
    networkReachabilityManager.startMonitoring()

    NSNotificationCenter.defaultCenter().addObserver(self, selector: "applicationWillEnterForeground", name: UIApplicationWillEnterForegroundNotification, object: nil)
  }

  deinit {
    NSNotificationCenter.defaultCenter().removeObserver(self)
  }

  func resume() {
    dispatch_async(queue) {
      if self.backgroundTask == UIBackgroundTaskInvalid {
        NSLog("Start downloading assets from bundle with version: \(self.assetBundle.version)")

        CDVTimer.start("assetBundleDownload")

        let application = UIApplication.sharedApplication()
        self.backgroundTask = application.beginBackgroundTaskWithName("AssetBundleDownload") {
          // Expiration handler, usually invoked 180 seconds after the app goes
          // into the background
          NSLog("AssetBundleDownload task expired, app is suspending")
          self.status = .Suspended
          self.endBackgroundTask()
        }
      }

      self.status = .Running

      let assetsDownloading = Set(self.assetsDownloadingByTaskIdentifier.values)

      for asset in self.missingAssets {
        if assetsDownloading.contains(asset) { continue }

        let task: NSURLSessionTask

        // If we have previously stored resume data, use that to recreate the
        // task
        if let resumeData = self.resumeDataByAsset.removeValueForKey(asset) {
          task = self.session.downloadTaskWithResumeData(resumeData)
        } else {
          guard let URL = self.downloadURLForAsset(asset) else {
            self.cancelAndFailWithReason("Invalid URL for asset: \(asset)")
            return
          }

          task = self.session.dataTaskWithURL(URL)
        }

        self.assetsDownloadingByTaskIdentifier[task.taskIdentifier] = asset
        task.resume()
      }
    }
  }

  private func resumeLater() {
    if status == .Running {
      let retryInterval = retryStrategy.retryIntervalForNumberOfAttempts(numberOfRetryAttempts)
      NSLog("Will retry resuming downloads after %f seconds", retryInterval);
      resumeTimer.startWithTimeInterval(retryInterval)
      numberOfRetryAttempts++
      status = .Waiting
    }
  }

  private func downloadURLForAsset(asset: Asset) -> NSURL? {
    var URLPath = asset.URLPath

    // Remove leading / from URL path because the path should be relative to the base URL
    if URLPath.hasPrefix("/") {
      URLPath = String(asset.URLPath.utf16.dropFirst())
    }

    guard let URLComponents = NSURLComponents(string: URLPath) else {
      return nil
    }

    // To avoid inadvertently downloading the default index page when an asset
    // is not found, we add meteor_dont_serve_index=true to the URL unless we
    // are actually downloading the index page.
    if asset.filePath != "index.html" {
      let queryItem = NSURLQueryItem(name: "meteor_dont_serve_index", value: "true")
      if var queryItems = URLComponents.queryItems {
        queryItems.append(queryItem)
        URLComponents.queryItems = queryItems
      } else {
        URLComponents.queryItems = [queryItem]
      }
    }

    return URLComponents.URLRelativeToURL(baseURL)
  }

  private func endBackgroundTask() {
    let application = UIApplication.sharedApplication()
    application.endBackgroundTask(self.backgroundTask)
    self.backgroundTask = UIBackgroundTaskInvalid;

    CDVTimer.stop("assetBundleDownload")
  }

  func cancel() {
    dispatch_sync(queue) {
      self._cancel()
    }
  }

  private func _cancel() {
    if self.status != .Canceling || self.status == .Invalid {
      self.status = .Canceling
      self.session.invalidateAndCancel()
      self.endBackgroundTask()
    }
  }

  private func cancelAndFailWithReason(reason: String, underlyingError: ErrorType? = nil) {
    let error = WebAppError.DownloadFailure(reason: reason, underlyingError: underlyingError)
    cancelAndFailWithError(error)
  }

  private func cancelAndFailWithError(error: ErrorType) {
    _cancel()
    delegate?.assetBundleDownloader(self, didFailWithError: error)
  }

  private func didFinish() {
    session.finishTasksAndInvalidate()
    delegate?.assetBundleDownloaderDidFinish(self)
    endBackgroundTask()
  }

  // MARK: Application State Notifications

  func applicationWillEnterForeground() {
    if status == .Suspended {
      resume()
    }
  }

  // MARK: METNetworkReachabilityManagerDelegate

  func networkReachabilityManager(reachabilityManager: METNetworkReachabilityManager, didDetectReachabilityStatusChange reachabilityStatus: METNetworkReachabilityStatus) {

    if reachabilityStatus == .Reachable && status == .Waiting {
      resume()
    }
  }

  // MARK: NSURLSessionDelegate

  func URLSession(session: NSURLSession, didBecomeInvalidWithError error: NSError?) {
    status = .Invalid
  }

  func URLSessionDidFinishEventsForBackgroundURLSession(session: NSURLSession) {
  }

  // MARK: NSURLSessionTaskDelegate

  func URLSession(session: NSURLSession, task: NSURLSessionTask, didCompleteWithError error: NSError?) {
    if let error = error {
      if let asset = assetsDownloadingByTaskIdentifier.removeValueForKey(task.taskIdentifier) {
        if task is NSURLSessionDownloadTask && status != .Canceling {
          NSLog("Download of asset: \(asset) did fail with error: \(error)")

          // If there is resume data, we store it and use it to recreate the task later
          if let resumeData = error.userInfo[NSURLSessionDownloadTaskResumeData] as? NSData {
            resumeDataByAsset[asset] = resumeData
          }
          resumeLater()
        }
      }
    }
  }

  // MARK: NSURLSessionDataDelegate

  func URLSession(session: NSURLSession, dataTask: NSURLSessionDataTask, didReceiveResponse response: NSURLResponse, completionHandler: (NSURLSessionResponseDisposition) -> Void) {
    if status == .Canceling { return }

    guard let response = response as? NSHTTPURLResponse else { return }

    if let asset = assetsDownloadingByTaskIdentifier[dataTask.taskIdentifier] {
      do {
        try verifyResponse(response, forAsset: asset)
        completionHandler(.BecomeDownload)
      } catch {
        completionHandler(.Cancel)
        self.cancelAndFailWithError(error)
      }
    }
  }

  func URLSession(session: NSURLSession, dataTask: NSURLSessionDataTask, didBecomeDownloadTask downloadTask: NSURLSessionDownloadTask) {
    if let asset = assetsDownloadingByTaskIdentifier.removeValueForKey(dataTask.taskIdentifier) {
      assetsDownloadingByTaskIdentifier[downloadTask.taskIdentifier] = asset
    }
  }

  // MARK: NSURLSessionDownloadDelegate

  func URLSession(session: NSURLSession, downloadTask: NSURLSessionDownloadTask, didResumeAtOffset fileOffset: Int64, expectedTotalBytes: Int64) {
    if status == .Canceling { return }

    guard let response = downloadTask.response as? NSHTTPURLResponse else { return }

    if let asset = assetsDownloadingByTaskIdentifier[downloadTask.taskIdentifier] {
      do {
        try verifyResponse(response, forAsset: asset)
      } catch {
        self.cancelAndFailWithError(error)
      }
    }
  }

  func URLSession(session: NSURLSession, downloadTask: NSURLSessionDownloadTask, didFinishDownloadingToURL location: NSURL) {
    if let asset = assetsDownloadingByTaskIdentifier.removeValueForKey(downloadTask.taskIdentifier) {
      if status == .Canceling { return }

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
        try fileManager.moveItemAtURL(location, toURL: asset.fileURL)
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

  private func verifyResponse(response: NSHTTPURLResponse, forAsset asset: Asset) throws {
    // A response with a non-success status code should not be considered a succesful download
    if !response.isSuccessful {
      throw WebAppError.DownloadFailure(reason: "Non-success status code \(response.statusCode) for asset: \(asset)", underlyingError: nil)
      // If we have a hash for the asset, and the ETag header also specifies
      // a hash, we compare these to verify if we received the expected asset version
    } else if let expectedHash = asset.hash,
      let ETag = response.allHeaderFields["ETag"] as? String,
      let actualHash = SHA1HashFromETag(ETag)
      where actualHash != expectedHash {
        throw WebAppError.DownloadFailure(reason: "Hash mismatch for asset: \(asset)", underlyingError: nil)
    }
  }
  
  private func verifyRuntimeConfig(runtimeConfig: AssetBundle.RuntimeConfig) throws {
    let expectedVersion = assetBundle.version
    if let actualVersion = runtimeConfig.autoupdateVersionCordova
      where expectedVersion != actualVersion {
        throw WebAppError.DownloadFailure(reason: "Version mismatch for index page, expected: \(expectedVersion), actual: \(actualVersion)", underlyingError: nil)
    }
    
    guard let rootURL = runtimeConfig.rootURL else {
      throw WebAppError.UnsuitableAssetBundle(reason: "Could not find ROOT_URL in downloaded asset bundle", underlyingError: nil)
    }
    
    if configuration.rootURL?.host != "localhost" && rootURL.host == "localhost" {
      throw WebAppError.UnsuitableAssetBundle(reason: "ROOT_URL in downloaded asset bundle would change current ROOT_URL to localhost. Make sure ROOT_URL has been configured correctly on the server.", underlyingError: nil)
    }
    
    guard let appId = runtimeConfig.appId else {
      throw WebAppError.UnsuitableAssetBundle(reason: "Could not find appId in downloaded asset bundle", underlyingError: nil)
    }
    
    if appId != configuration.appId {
      throw WebAppError.UnsuitableAssetBundle(reason: "appId in downloaded asset bundle does not match current appId. Make sure the server at \(rootURL) is serving the right app.", underlyingError: nil)
    }
  }
}
