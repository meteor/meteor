protocol AssetBundleDownloaderDelegate: class {
  func assetBundleDownloader(assetBundleDownloader: AssetBundleDownloader, didFinishDownloadingBundle assetBundle: AssetBundle)
  func assetBundleDownloader(assetBundleDownloader: AssetBundleDownloader, didFailDownloadingWithError error: ErrorType)
}

final class AssetBundleDownloader: NSObject, NSURLSessionDelegate, NSURLSessionTaskDelegate, NSURLSessionDownloadDelegate {
  private(set) var assetBundle: AssetBundle

  weak var delegate: AssetBundleDownloaderDelegate?

  /// A private serial queue used to synchronize access
  private let queue: dispatch_queue_t

  private let fileManager = NSFileManager()

  private var session: NSURLSession!
  private var assetsDownloadingByTaskIdentifier: [Int:Asset]
  private var cancelled: Bool = false

  private var backgroundTask: UIBackgroundTaskIdentifier = UIBackgroundTaskInvalid

  init(assetBundle: AssetBundle, queue: dispatch_queue_t) {
    self.assetBundle = assetBundle
    self.queue = queue

    let sessionConfiguration = NSURLSessionConfiguration.defaultSessionConfiguration()
    sessionConfiguration.HTTPMaximumConnectionsPerHost = 6

    // Disable the protocol-level local cache, because we make sure to only
    // download changed files, so there is no need to waste additional storage
    sessionConfiguration.URLCache = nil
    sessionConfiguration.requestCachePolicy = .ReloadIgnoringLocalCacheData

    let operationQueue = NSOperationQueue()
    operationQueue.maxConcurrentOperationCount = 1
    operationQueue.underlyingQueue = queue

    assetsDownloadingByTaskIdentifier = [Int:Asset]()

    super.init()

    session = NSURLSession(configuration: sessionConfiguration, delegate: self, delegateQueue: operationQueue)
  }

  func downloadAssets(assets: [Asset], withBaseURL baseURL: NSURL) {
    NSLog("Start downloading assets from bundle with version: \(assetBundle.version!)")

    CDVTimer.start("assetBundleDownload")

    if backgroundTask == UIBackgroundTaskInvalid {
      let application = UIApplication.sharedApplication()
      backgroundTask = application.beginBackgroundTaskWithName("AssetBundleDownload") {
        // Expiration handler, usually invoked 180 seconds after the app goes
        // into the background
        NSLog("AssetBundleDownload task expired, app is suspending")
        self.endBackgroundTask()
      }
    }

    var downloadTasks = [NSURLSessionDownloadTask]()

    for asset in assets {
      var URLPath = asset.URLPath

      // Remove leading / from URL path because the path should be relative to the base URL
      if URLPath.hasPrefix("/") {
        URLPath = String(asset.URLPath.utf16.dropFirst())
      }

      guard let URL = NSURL(string: URLPath, relativeToURL: baseURL) else {
        self.cancelAndFailWithReason("Invalid URL path for asset: \(URLPath)")
        return
      }

      let downloadTask = session.downloadTaskWithURL(URL)
      assetsDownloadingByTaskIdentifier[downloadTask.taskIdentifier] = asset
      downloadTasks.append(downloadTask)
    }

    downloadTasks.forEach({ $0.resume() })
  }

  private func endBackgroundTask() {
    let application = UIApplication.sharedApplication()
    application.endBackgroundTask(self.backgroundTask)
    self.backgroundTask = UIBackgroundTaskInvalid;
  }

  func cancel() {
    cancelled = true
    session.invalidateAndCancel()
    endBackgroundTask()
  }

  private func cancelAndFailWithReason(reason: String, underlyingError: ErrorType? = nil) {
    cancel()

    let error = WebAppError.DownloadFailure(reason: reason, underlyingError: underlyingError)
    delegate?.assetBundleDownloader(self, didFailDownloadingWithError: error)
  }

  private func didFinishDownloadingBundle() {
    session.finishTasksAndInvalidate()

    delegate?.assetBundleDownloader(self, didFinishDownloadingBundle: assetBundle)

    endBackgroundTask()
  }

  // MARK: NSURLSessionDelegate

  func URLSession(session: NSURLSession, didBecomeInvalidWithError error: NSError?) {
    CDVTimer.stop("assetBundleDownload")
  }

  func URLSessionDidFinishEventsForBackgroundURLSession(session: NSURLSession) {
  }

  // MARK: NSURLSessionTaskDelegate

  func URLSession(session: NSURLSession, task: NSURLSessionTask, didCompleteWithError error: NSError?) {
    if let error = error, let downloadTask = task as? NSURLSessionDownloadTask {
      if !cancelled {
        NSLog("Download of \(downloadTask.originalRequest!.URL!) did fail with error: \(error)")
      }
    }
  }

  // MARK: NSURLSessionDownloadDelegate

  func URLSession(session: NSURLSession, downloadTask: NSURLSessionDownloadTask, didWriteData bytesWritten: Int64, totalBytesWritten: Int64, totalBytesExpectedToWrite: Int64) {
    NSLog("\(downloadTask.originalRequest!.URL!) did download \(totalBytesWritten) bytes")
  }

  func URLSession(session: NSURLSession, downloadTask: NSURLSessionDownloadTask, didFinishDownloadingToURL location: NSURL) {
    NSLog("\(downloadTask.originalRequest!.URL!) did finish downloading")

    if let asset = assetsDownloadingByTaskIdentifier.removeValueForKey(downloadTask.taskIdentifier) {
      // If we have a hash for the asset, and the ETag header also specifies
      // a hash, we compare these to verify if we received the expected asset version
      if let hash = asset.hash,
          let response = downloadTask.response as? NSHTTPURLResponse,
          let ETag = response.allHeaderFields["ETag"] as? String
          where sha1HashRegEx.matches(ETag) && ETag != hash {
        self.cancelAndFailWithReason("Hash mismatch for asset: \(asset.filePath)")
        return
      }

      do {
        try fileManager.moveItemAtURL(location, toURL: asset.fileURL)
      } catch {
        self.cancelAndFailWithReason("Could not move downloaded asset", underlyingError: error)
        return
      }

      if assetsDownloadingByTaskIdentifier.isEmpty && !cancelled {
        didFinishDownloadingBundle()
      }
    }
  }
}
