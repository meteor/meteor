protocol AssetBundleManagerDelegate: class {
  func assetBundleManager(_ assetBundleManager: AssetBundleManager, shouldDownloadBundleForManifest manifest: AssetManifest) -> Bool
  func assetBundleManager(_ assetBundleManager: AssetBundleManager, didFinishDownloadingBundle assetBundle: AssetBundle)
  func assetBundleManager(_ assetBundleManager: AssetBundleManager, didFailDownloadingBundleWithError error: Error)
}

final class AssetBundleManager: AssetBundleDownloaderDelegate {
  let configuration: WebAppConfiguration
  
  /// The directory used to store downloaded asset bundles
  let versionsDirectoryURL: URL

  /// The initial asset bundle included in the app bundle
  let initialAssetBundle: AssetBundle

  weak var delegate: AssetBundleManagerDelegate?

  /// A private serial queue used to synchronize access
  private let queue: DispatchQueue

  private let fileManager = FileManager()
  private var downloadedAssetBundlesByVersion: [String: AssetBundle]
  
  private var session: URLSession!
  
  private var downloadDirectoryURL: URL
  private var assetBundleDownloader: AssetBundleDownloader?
  private var partiallyDownloadedAssetBundle: AssetBundle?

  var isDownloading: Bool {
    return assetBundleDownloader != nil
  }

  init(configuration: WebAppConfiguration, versionsDirectoryURL: URL, initialAssetBundle: AssetBundle) {
    self.configuration = configuration
    self.versionsDirectoryURL = versionsDirectoryURL
    self.initialAssetBundle = initialAssetBundle

    downloadDirectoryURL = versionsDirectoryURL.appendingPathComponent("Downloading")

    queue = DispatchQueue(label: "com.meteor.webapp.AssetBundleManager", attributes: [])

    downloadedAssetBundlesByVersion = [String: AssetBundle]()
    loadDownloadedAssetBundles()
    
    let operationQueue = OperationQueue()
    operationQueue.maxConcurrentOperationCount = 1
    operationQueue.underlyingQueue = queue
    
    // We use a separate to download the manifest, so we can use caching
    // (which we disable for the session we use to download the other files 
    // in AssetBundleDownloader)
    session = URLSession(configuration: URLSessionConfiguration.default, delegate: nil, delegateQueue: operationQueue)
  }
  
  deinit {
    assetBundleDownloader?.cancel()
  }

  private func loadDownloadedAssetBundles() {
    let items: [URL]
    items = try! fileManager.contentsOfDirectory(at: versionsDirectoryURL,
      includingPropertiesForKeys: [URLResourceKey.isDirectoryKey],
      options: [.skipsHiddenFiles])

    for itemURL in items {
      if itemURL.isDirectory != true { continue }

      let version = itemURL.lastPathComponent

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

  func downloadedAssetBundleWithVersion(_ version: String) -> AssetBundle? {
    var assetBundle: AssetBundle?
    queue.sync {
      assetBundle = self.downloadedAssetBundlesByVersion[version]
    }
    return assetBundle
  }

  func checkForUpdatesWithBaseURL(_ baseURL: URL) {
    let manifestURL = URL(string: "manifest.json", relativeTo: baseURL)!

    NSLog("Start downloading asset manifest from: \(manifestURL)")

    let dataTask = session.dataTask(with: manifestURL, completionHandler: {
      (data, response, error) in
      guard let data = data else {
        self.didFailWithError(WebAppError.downloadFailure(reason: "Error downloading asset manifest", underlyingError: error))
        return
      }

      guard let response = response as? HTTPURLResponse else { return }

      if !response.isSuccessful {
        self.didFailWithError(WebAppError.downloadFailure(reason: "Non-success status code \(response.statusCode) for asset manifest", underlyingError: nil))
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

      self.queue.async {
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
          try self.fileManager.createDirectory(at: self.downloadDirectoryURL, withIntermediateDirectories: true, attributes: nil)
        } catch {
          self.didFailWithError(WebAppError.fileSystemFailure(reason: "Could not create download directory", underlyingError: error))
          return
        }

        let manifestFileURL = self.downloadDirectoryURL.appendingPathComponent("program.json")
        if !((try? data.write(to: manifestFileURL, options: [])) != nil) {
          self.didFailWithError(WebAppError.fileSystemFailure(reason: "Could not write asset manifest to: \(manifestFileURL)", underlyingError: error))
          return
        }

        do {
          let assetBundle = try AssetBundle(directoryURL: self.downloadDirectoryURL, manifest: manifest, parentAssetBundle: self.initialAssetBundle)
          self.downloadAssetBundle(assetBundle, withBaseURL: baseURL)
        } catch let error {
          self.didFailWithError(error)
        }
      }
    }) 

    // If a new version is available, we want to know as soon as possible even
    // if other downloads are in progress
    dataTask.priority = URLSessionTask.highPriority
    dataTask.resume()
  }

  /// If there is an existing Downloading directory, move it
  /// to PartialDownload and load the partiallyDownloadedAssetBundle so we
  /// don't unnecessarily redownload assets
  private func moveExistingDownloadDirectoryIfNeeded() {
    if fileManager.fileExists(atPath: downloadDirectoryURL.path) {
      let partialDownloadDirectoryURL = self.versionsDirectoryURL.appendingPathComponent("PartialDownload")
      do {
        if fileManager.fileExists(atPath: partialDownloadDirectoryURL.path) {
          try fileManager.removeItem(at: partialDownloadDirectoryURL)
        }
        try fileManager.moveItem(at: downloadDirectoryURL, to: partialDownloadDirectoryURL)
      } catch {
        self.didFailWithError(WebAppError.fileSystemFailure(reason: "Could not move Downloading directory to PartialDownload", underlyingError: error))
        return
      }

      do {
        partiallyDownloadedAssetBundle = try AssetBundle(directoryURL: partialDownloadDirectoryURL, parentAssetBundle: initialAssetBundle)
      } catch {
        NSLog("Could not load partially downloaded asset bundle: \(error)")
      }
    }
  }

  private func downloadAssetBundle(_ assetBundle: AssetBundle, withBaseURL baseURL: URL) {
    var missingAssets = Set<Asset>()

    for asset in assetBundle.ownAssets {
      // Create containing directories for the asset if necessary
      let containingDirectoryURL = asset.fileURL.deletingLastPathComponent()
      do {
        try fileManager.createDirectory(at: containingDirectoryURL, withIntermediateDirectories: true, attributes: nil)
      } catch {
        self.didFailWithError(WebAppError.fileSystemFailure(reason: "Could not create containing directories for asset", underlyingError: error))
        return
      }

      // If we find a cached asset, we make a hard link to it
      if let cachedAsset = cachedAssetForAsset(asset) {
        do {
          try fileManager.linkItem(at: cachedAsset.fileURL as URL, to: asset.fileURL as URL)
        } catch {
          self.didFailWithError(WebAppError.fileSystemFailure(reason: "Could not link to cached asset", underlyingError: error))
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

  private func didFinishDownloadingAssetBundle(_ assetBundle: AssetBundle) {
    delegate?.assetBundleManager(self, didFinishDownloadingBundle: assetBundle)
  }

  private func didFailWithError(_ error: Error) {
    delegate?.assetBundleManager(self, didFailDownloadingBundleWithError: error)
  }

  private func cachedAssetForAsset(_ asset: Asset) -> Asset? {
    for assetBundle in downloadedAssetBundlesByVersion.values {
      if let cachedAsset = assetBundle.cachedAssetForURLPath(asset.urlPath, hash: asset.hash) {
        return cachedAsset
      }
    }

    if let cachedAsset = partiallyDownloadedAssetBundle?.cachedAssetForURLPath(asset.urlPath, hash: asset.hash) {
      // Make sure the asset has been downloaded
      if fileManager.fileExists(atPath: cachedAsset.fileURL.path) {
        return cachedAsset
      }
    }

    return nil
  }

  /// Move the downloaded asset bundle to a new directory named after the version
  private func moveDownloadedAssetBundleIntoPlace(_ assetBundle: AssetBundle) throws {
    let versionDirectoryURL = self.versionsDirectoryURL.appendingPathComponent(assetBundle.version)

    do {
      if fileManager.fileExists(atPath: versionDirectoryURL.path) {
        try fileManager.removeItem(at: versionDirectoryURL)
      }

      try fileManager.moveItem(at: assetBundle.directoryURL as URL, to: versionDirectoryURL)

      assetBundle.didMoveToDirectoryAtURL(versionDirectoryURL)

      downloadedAssetBundlesByVersion[assetBundle.version] = assetBundle
    } catch {
      throw WebAppError.fileSystemFailure(reason: "Could not move downloaded asset bundle into place", underlyingError: error)
    }
  }

  /// Remove all downloaded asset bundles, except for one
  func removeAllDownloadedAssetBundlesExceptFor(_ assetBundleToKeep: AssetBundle) throws {
    try queue.sync {
      for assetBundle in self.downloadedAssetBundlesByVersion.values {
        if assetBundle !== assetBundleToKeep {
          try self.fileManager.removeItem(at: assetBundle.directoryURL)
          self.downloadedAssetBundlesByVersion.removeValue(forKey: assetBundle.version)
        }
      }
    }
  }

  // MARK: AssetBundleDownloaderDelegate

  func assetBundleDownloaderDidFinish(_ assetBundleDownloader: AssetBundleDownloader) {
    let downloadedAssetBundle = assetBundleDownloader.assetBundle
    self.assetBundleDownloader = nil

    queue.async {
      do {
        try self.moveDownloadedAssetBundleIntoPlace(downloadedAssetBundle)
        self.didFinishDownloadingAssetBundle(downloadedAssetBundle)
      } catch {
        self.didFailWithError(error)
      }
    }
  }

  func assetBundleDownloader(_ assetBundleDownloader: AssetBundleDownloader, didFailWithError error: Error) {
    self.assetBundleDownloader = nil

    queue.async {
      self.didFailWithError(error)
    }
  }
}
