protocol AssetBundleManagerDelegate: class {
  func assetBundleManager(assetBundleManager: AssetBundleManager, shouldDownloadBundleForManifest manifest: AssetManifest) -> Bool
  func assetBundleManager(assetBundleManager: AssetBundleManager, didFinishDownloadingBundle assetBundle: AssetBundle)
  func assetBundleManager(assetBundleManager: AssetBundleManager, didFailDownloadingBundleWithError error: ErrorType)
}

final class AssetBundleManager: AssetBundleDownloaderDelegate {
  let configuration: WebAppConfiguration
  
  /// The directory used to store downloaded asset bundles
  let versionsDirectoryURL: NSURL

  /// The initial asset bundle included in the app bundle
  let initialAssetBundle: AssetBundle

  weak var delegate: AssetBundleManagerDelegate?

  /// A private serial queue used to synchronize access
  private let queue: dispatch_queue_t

  private let fileManager = NSFileManager()
  private var downloadedAssetBundlesByVersion: [String: AssetBundle]
  
  private var session: NSURLSession!
  
  private var downloadDirectoryURL: NSURL
  private var assetBundleDownloader: AssetBundleDownloader?
  private var partiallyDownloadedAssetBundle: AssetBundle?

  var isDownloading: Bool {
    return assetBundleDownloader != nil
  }

  init(configuration: WebAppConfiguration, versionsDirectoryURL: NSURL, initialAssetBundle: AssetBundle) {
    self.configuration = configuration
    self.versionsDirectoryURL = versionsDirectoryURL
    self.initialAssetBundle = initialAssetBundle

    downloadDirectoryURL = versionsDirectoryURL.URLByAppendingPathComponent("Downloading")

    queue = dispatch_queue_create("com.meteor.webapp.AssetBundleManager", nil)

    downloadedAssetBundlesByVersion = [String: AssetBundle]()
    loadDownloadedAssetBundles()
    
    let operationQueue = NSOperationQueue()
    operationQueue.maxConcurrentOperationCount = 1
    operationQueue.underlyingQueue = queue
    
    // We use a separate to download the manifest, so we can use caching
    // (which we disable for the session we use to download the other files 
    // in AssetBundleDownloader)
    session = NSURLSession(configuration: NSURLSessionConfiguration.defaultSessionConfiguration(), delegate: nil, delegateQueue: operationQueue)
  }
  
  deinit {
    assetBundleDownloader?.cancel()
  }

  private func loadDownloadedAssetBundles() {
    let items: [NSURL]
    items = try! fileManager.contentsOfDirectoryAtURL(versionsDirectoryURL,
      includingPropertiesForKeys: [NSURLIsDirectoryKey],
      options: [.SkipsHiddenFiles])

    for itemURL in items {
      if itemURL.isDirectory != true { continue }

      guard let version = itemURL.lastPathComponent else { continue }

      if version == "PartialDownload" { continue }
      if version == "Downloading" { continue }

      let assetBundle: AssetBundle
      do {
        assetBundle = try AssetBundle(directoryURL: itemURL, parentAssetBundle: initialAssetBundle)
        downloadedAssetBundlesByVersion[version] = assetBundle
      } catch {
        NSLog("Could not load asset bundle: \(error)")
      }
    }
  }

  func downloadedAssetBundleWithVersion(version: String) -> AssetBundle? {
    var assetBundle: AssetBundle?
    dispatch_sync(queue) {
      assetBundle = self.downloadedAssetBundlesByVersion[version]
    }
    return assetBundle
  }

  func checkForUpdatesWithBaseURL(baseURL: NSURL) {
    let manifestURL = NSURL(string: "manifest.json", relativeToURL: baseURL)!

    NSLog("Start downloading asset manifest from: \(manifestURL)")

    let dataTask = session.dataTaskWithURL(manifestURL) {
      (data, response, error) in
      guard let data = data else {
        self.didFailWithError(WebAppError.DownloadFailure(reason: "Error downloading asset manifest", underlyingError: error))
        return
      }

      guard let response = response as? NSHTTPURLResponse else { return }

      if !response.isSuccessful {
        self.didFailWithError(WebAppError.DownloadFailure(reason: "Non-success status code \(response.statusCode) for asset manifest", underlyingError: nil))
        return
      }

      let manifest: AssetManifest
      do {
        manifest = try AssetManifest(data: data)
      } catch {
        self.didFailWithError(error)
        return
      }

      let version = manifest.version

      NSLog("Downloaded asset manifest for version: \(version)")

      dispatch_async(self.queue) {
        if self.assetBundleDownloader?.assetBundle.version == version {
          NSLog("Already downloading asset bundle version: \(version)")
          return
        }

        // Give the delegate a chance to decide whether the version should be downloaded
        if !(self.delegate?.assetBundleManager(self, shouldDownloadBundleForManifest: manifest) ?? false) {
          return
        }

        // Cancel in progress download if there is one
        self.assetBundleDownloader?.cancel()
        self.assetBundleDownloader = nil

        // There is no need to redownload the initial version
        if self.initialAssetBundle.version == version {
          self.didFinishDownloadingAssetBundle(self.initialAssetBundle)
          return
        }

        // If there is a previously downloaded asset bundle with the requested
        // version, use that
        if let assetBundle = self.downloadedAssetBundlesByVersion[version] {
          self.didFinishDownloadingAssetBundle(assetBundle)
          return
        }
        
        // Else, get ready to download the new asset bundle
        self.moveExistingDownloadDirectoryIfNeeded()
        
        // Create download directory
        do {
          try self.fileManager.createDirectoryAtURL(self.downloadDirectoryURL, withIntermediateDirectories: true, attributes: nil)
        } catch {
          self.didFailWithError(WebAppError.FileSystemFailure(reason: "Could not create download directory", underlyingError: error))
          return
        }

        let manifestFileURL = self.downloadDirectoryURL.URLByAppendingPathComponent("program.json")
        if !data.writeToURL(manifestFileURL, atomically: false) {
          self.didFailWithError(WebAppError.FileSystemFailure(reason: "Could not write asset manifest to: \(manifestFileURL)", underlyingError: error))
          return
        }

        do {
          let assetBundle = try AssetBundle(directoryURL: self.downloadDirectoryURL, manifest: manifest, parentAssetBundle: self.initialAssetBundle)
          self.downloadAssetBundle(assetBundle, withBaseURL: baseURL)
        } catch let error {
          self.didFailWithError(error)
        }
      }
    }

    // If a new version is available, we want to know as soon as possible even
    // if other downloads are in progress
    dataTask.priority = NSURLSessionTaskPriorityHigh
    dataTask.resume()
  }

  /// If there is an existing Downloading directory, move it
  /// to PartialDownload and load the partiallyDownloadedAssetBundle so we
  /// don't unnecessarily redownload assets
  private func moveExistingDownloadDirectoryIfNeeded() {
    if fileManager.fileExistsAtPath(downloadDirectoryURL.path!) {
      let partialDownloadDirectoryURL = self.versionsDirectoryURL.URLByAppendingPathComponent("PartialDownload")
      do {
        if fileManager.fileExistsAtPath(partialDownloadDirectoryURL.path!) {
          try fileManager.removeItemAtURL(partialDownloadDirectoryURL)
        }
        try fileManager.moveItemAtURL(downloadDirectoryURL, toURL: partialDownloadDirectoryURL)
      } catch {
        self.didFailWithError(WebAppError.FileSystemFailure(reason: "Could not move Downloading directory to PartialDownload", underlyingError: error))
        return
      }

      do {
        partiallyDownloadedAssetBundle = try AssetBundle(directoryURL: partialDownloadDirectoryURL, parentAssetBundle: initialAssetBundle)
      } catch {
        NSLog("Could not load partially downloaded asset bundle: \(error)")
      }
    }
  }

  private func downloadAssetBundle(assetBundle: AssetBundle, withBaseURL baseURL: NSURL) {
    var missingAssets = Set<Asset>()

    for asset in assetBundle.ownAssets {
      // Create containing directories for the asset if necessary
      if let containingDirectoryURL = asset.fileURL.URLByDeletingLastPathComponent {
        do {
          try fileManager.createDirectoryAtURL(containingDirectoryURL, withIntermediateDirectories: true, attributes: nil)
        } catch {
          self.didFailWithError(WebAppError.FileSystemFailure(reason: "Could not create containing directories for asset", underlyingError: error))
          return
        }
      }

      // If we find a cached asset, we make a hard link to it
      if let cachedAsset = cachedAssetForAsset(asset) {
        do {
          try fileManager.linkItemAtURL(cachedAsset.fileURL, toURL: asset.fileURL)
        } catch {
          self.didFailWithError(WebAppError.FileSystemFailure(reason: "Could not link to cached asset", underlyingError: error))
          return
        }
      } else {
        missingAssets.insert(asset)
      }
    }

    // If all assets were cached, there is no need to start a download
    if missingAssets.isEmpty {
      do {
        try moveDownloadedAssetBundleIntoPlace(assetBundle)
        didFinishDownloadingAssetBundle(assetBundle)
      } catch {
        self.didFailWithError(error)
      }
      return
    }

    assetBundleDownloader = AssetBundleDownloader(configuration: configuration, assetBundle: assetBundle, baseURL: baseURL, missingAssets: missingAssets)
    assetBundleDownloader!.delegate = self
    assetBundleDownloader!.resume()
  }

  private func didFinishDownloadingAssetBundle(assetBundle: AssetBundle) {
    delegate?.assetBundleManager(self, didFinishDownloadingBundle: assetBundle)
  }

  private func didFailWithError(error: ErrorType) {
    delegate?.assetBundleManager(self, didFailDownloadingBundleWithError: error)
  }

  private func cachedAssetForAsset(asset: Asset) -> Asset? {
    for assetBundle in downloadedAssetBundlesByVersion.values {
      if let cachedAsset = assetBundle.cachedAssetForURLPath(asset.URLPath, hash: asset.hash) {
        return cachedAsset
      }
    }

    if let cachedAsset = partiallyDownloadedAssetBundle?.cachedAssetForURLPath(asset.URLPath, hash: asset.hash) {
      // Make sure the asset has been downloaded
      if fileManager.fileExistsAtPath(cachedAsset.fileURL.path!) {
        return cachedAsset
      }
    }

    return nil
  }

  /// Move the downloaded asset bundle to a new directory named after the version
  private func moveDownloadedAssetBundleIntoPlace(assetBundle: AssetBundle) throws {
    let versionDirectoryURL = self.versionsDirectoryURL.URLByAppendingPathComponent(assetBundle.version)

    do {
      if fileManager.fileExistsAtPath(versionDirectoryURL.path!) {
        try fileManager.removeItemAtURL(versionDirectoryURL)
      }

      try fileManager.moveItemAtURL(assetBundle.directoryURL, toURL: versionDirectoryURL)

      assetBundle.didMoveToDirectoryAtURL(versionDirectoryURL)

      downloadedAssetBundlesByVersion[assetBundle.version] = assetBundle
    } catch {
      throw WebAppError.FileSystemFailure(reason: "Could not move downloaded asset bundle into place", underlyingError: error)
    }
  }

  /// Remove all downloaded asset bundles, except for one
  func removeAllDownloadedAssetBundlesExceptFor(assetBundleToKeep: AssetBundle) throws {
    try dispatch_sync(queue) {
      for assetBundle in self.downloadedAssetBundlesByVersion.values {
        if assetBundle !== assetBundleToKeep {
          try self.fileManager.removeItemAtURL(assetBundle.directoryURL)
          self.downloadedAssetBundlesByVersion.removeValueForKey(assetBundle.version)
        }
      }
    }
  }

  // MARK: AssetBundleDownloaderDelegate

  func assetBundleDownloaderDidFinish(assetBundleDownloader: AssetBundleDownloader) {
    let downloadedAssetBundle = assetBundleDownloader.assetBundle
    self.assetBundleDownloader = nil

    dispatch_async(queue) {
      do {
        try self.moveDownloadedAssetBundleIntoPlace(downloadedAssetBundle)
        self.didFinishDownloadingAssetBundle(downloadedAssetBundle)
      } catch {
        self.didFailWithError(error)
      }
    }
  }

  func assetBundleDownloader(assetBundleDownloader: AssetBundleDownloader, didFailWithError error: ErrorType) {
    self.assetBundleDownloader = nil

    dispatch_async(queue) {
      self.didFailWithError(error)
    }
  }
}
