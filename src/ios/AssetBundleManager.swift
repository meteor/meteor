protocol AssetBundleManagerDelegate: class {
  func assetBundleManager(assetBundleManager: AssetBundleManager, didFinishDownloadingBundle assetBundle: AssetBundle)
  func assetBundleManager(assetBundleManager: AssetBundleManager, didFailDownloadingBundleWithError error: ErrorType)
  func assetBundleManager(assetBundleManager: AssetBundleManager, shouldDownloadBundleForManifest manifest: AssetManifest) -> Bool
}

final class AssetBundleManager: AssetBundleDownloaderDelegate {
  /// The directory used to store downloaded asset bundles
  let versionsDirectoryURL: NSURL

  /// The initial asset bundle included in the app bundle
  let initialAssetBundle: AssetBundle
  
  weak var delegate: AssetBundleManagerDelegate?
  
  /// A private serial queue used to synchronize access
  private let queue: dispatch_queue_t
  
  private let fileManager = NSFileManager()
  
  private var downloadedAssetBundlesByVersion: [String: AssetBundle]
  
  private var assetBundleDownloader: AssetBundleDownloader?
  private var partiallyDownloadedAssetBundle: AssetBundle?
  
  var isDownloading: Bool {
    return assetBundleDownloader != nil
  }

  init(versionsDirectoryURL: NSURL, initialAssetBundle: AssetBundle) {
    self.versionsDirectoryURL = versionsDirectoryURL
    self.initialAssetBundle = initialAssetBundle
    
    queue = dispatch_queue_create("com.meteor.webapp.AssetBundleManager", nil)
    
    downloadedAssetBundlesByVersion = [String: AssetBundle]()
    let items: [NSURL]
    items = try! fileManager.contentsOfDirectoryAtURL(versionsDirectoryURL,
      includingPropertiesForKeys: [NSURLIsDirectoryKey],
      options: [.SkipsHiddenFiles])
    
    for itemURL in items {
      if itemURL.isDirectory != true { continue }
      
      guard let version = itemURL.lastPathComponent else { continue }
      
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
    return downloadedAssetBundlesByVersion[version]
  }
  
  func checkForUpdatesWithBaseURL(baseURL: NSURL) {
    let manifestURL = NSURL(string: "manifest.json", relativeToURL: baseURL)!
    
    NSLog("Start downloading asset manifest from: \(manifestURL)")
    
    func didFailWithReason(reason: String, underlyingError: ErrorType? = nil) {
      NSLog("\(reason): \(underlyingError)")
    }
    
    // We use sharedSession to download the manifest, so we can use caching
    // (which we disable for the session we create in AssetBundleDownloader 
    // to download the other files)
    let dataTask = NSURLSession.sharedSession().dataTaskWithURL(manifestURL) {
      (data, response, error) in
      guard let data = data else {
        didFailWithReason("Error downloading asset manifest", underlyingError: error)
        return
      }
      
      let manifest: AssetManifest
      do {
        manifest = try AssetManifest(data: data)
      } catch {
        didFailWithReason("Error parsing asset manifest", underlyingError: error)
        return
      }
      
      guard let version = manifest.version else {
        NSLog("Downloaded asset manifest does not seem to have a version")
        return
      }
      
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
        
        let fileManager = self.fileManager
        
        // Cancel existing download if needed
        if let assetBundleDownloader = self.assetBundleDownloader {
          assetBundleDownloader.cancel()
          self.partiallyDownloadedAssetBundle = assetBundleDownloader.assetBundle
        }
        
        let downloadDirectoryURL = self.versionsDirectoryURL.URLByAppendingPathComponent("Downloading")
        
        if fileManager.fileExistsAtPath(downloadDirectoryURL.path!) {
          let partialDownloadDirectoryURL = self.versionsDirectoryURL.URLByAppendingPathComponent("PartialDownload")
          do {
            if fileManager.fileExistsAtPath(partialDownloadDirectoryURL.path!) {
              try fileManager.removeItemAtURL(partialDownloadDirectoryURL)
            }
            try fileManager.moveItemAtURL(downloadDirectoryURL, toURL: partialDownloadDirectoryURL)
          } catch {
            NSLog("Could not move Downloading directory to PartialDownload: \(error)")
            return
          }
          if let partiallyDownloadedAssetBundle = self.partiallyDownloadedAssetBundle {
            partiallyDownloadedAssetBundle.didMoveToDirectoryAtURL(partialDownloadDirectoryURL)
          } else {
            do {
              self.partiallyDownloadedAssetBundle = try AssetBundle(directoryURL: partialDownloadDirectoryURL, parentAssetBundle: self.initialAssetBundle)
            } catch {
              NSLog("Could not load partially downloaded asset bundle: \(error)")
              return
            }
          }
        }
        
        // If there is an existing asset bundle with the version, use that
        if let assetBundle = self.downloadedAssetBundleWithVersion(manifest.version!) {
          self.didFinishDownloadingAssetBundle(assetBundle)
        } else {
          // Create download directory, removing an existing one if necessary
          let downloadDirectoryURL = self.versionsDirectoryURL.URLByAppendingPathComponent("Downloading")
          do {
            try fileManager.createDirectoryAtURL(downloadDirectoryURL, withIntermediateDirectories: true, attributes: nil)
          } catch {
            NSLog("Could not create download directory: \(error)")
            return
          }
          
          let manifestFileURL = downloadDirectoryURL.URLByAppendingPathComponent("program.json")
          if !data.writeToURL(manifestFileURL, atomically: false) {
            NSLog("Could not write asset manifest to: \(manifestFileURL)")
            return
          }
          
          let assetBundle = AssetBundle(directoryURL: downloadDirectoryURL, manifest: manifest, parentAssetBundle: self.initialAssetBundle)
          self.downloadAssetBundle(assetBundle, withBaseURL: baseURL)
        }
      }
    }
    
    // If a new version is available, we want to know as soon as possible even
    // if other downloads are in progress
    dataTask.priority = NSURLSessionTaskPriorityHigh
    dataTask.resume()
  }
  
  private func downloadAssetBundle(assetBundle: AssetBundle, withBaseURL baseURL: NSURL) {
    // TODO: If there is an existing partial download, reuse the already downloaded assets if possible
    
    var missingAssets = [Asset]()
    for asset in assetBundle.ownAssets {
      // Create containing directories for the asset if necessary
      if let containingDirectoryURL = asset.fileURL.URLByDeletingLastPathComponent {
        do {
          try fileManager.createDirectoryAtURL(containingDirectoryURL, withIntermediateDirectories: true, attributes: nil)
        } catch {
          NSLog("Could not create containing directories for asset: \(error)")
          return
        }
      }
      
      // If we find a cached asset, we make a hard link to it
      if let cachedAsset = cachedAssetForAsset(asset) {
        do {
          try fileManager.linkItemAtURL(cachedAsset.fileURL, toURL: asset.fileURL)
        } catch {
          NSLog("Could not link to cached asset: \(error)")
          return
        }
      } else {
        missingAssets.append(asset)
      }
    }
    
    // If all assets were cached, there is no need to start a download
    if missingAssets.isEmpty {
      do {
        try moveDownloadedAssetBundleIntoPlace(assetBundle)
        didFinishDownloadingAssetBundle(assetBundle)
      } catch {
        NSLog("Could not move downloaded asset bundle into place: \(error)")
        return
      }
    } else {
      assetBundleDownloader = AssetBundleDownloader(assetBundle: assetBundle, queue: queue)
      assetBundleDownloader?.delegate = self
      assetBundleDownloader?.downloadAssets(missingAssets, withBaseURL: baseURL)
    }
  }

  /// Remove all asset bundles in the versions directory,
  /// except for the current one
  func removeAllAssetBundlesExceptForCurrentVersion(currentVersion: String?) throws {
    try dispatch_sync(queue) {
      for assetBundle in self.downloadedAssetBundlesByVersion.values {
        if assetBundle.version != currentVersion {
          try self.fileManager.removeItemAtURL(assetBundle.directoryURL)
          self.downloadedAssetBundlesByVersion.removeValueForKey(assetBundle.version!)
        }
      }
    }
  }

  /// Move the downloaded asset bundle to a new directory named after the version
  private func moveDownloadedAssetBundleIntoPlace(assetBundle: AssetBundle) throws {
    let versionDirectoryURL = self.versionsDirectoryURL.URLByAppendingPathComponent(assetBundle.version!)
    
    if fileManager.fileExistsAtPath(versionDirectoryURL.path!) {
      try fileManager.removeItemAtURL(versionDirectoryURL)
    }
    
    try fileManager.moveItemAtURL(assetBundle.directoryURL, toURL: versionDirectoryURL)
    
    assetBundle.didMoveToDirectoryAtURL(versionDirectoryURL)
    
    downloadedAssetBundlesByVersion[assetBundle.version!] = assetBundle
  }
  
  func didFinishDownloadingAssetBundle(assetBundle: AssetBundle) {
    delegate?.assetBundleManager(self, didFinishDownloadingBundle: assetBundle)
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
  
  // MARK: AssetBundleDownloaderDelegate
  
  func assetBundleDownloader(assetBundleDownloader: AssetBundleDownloader, didFinishDownloadingBundle assetBundle: AssetBundle) {
    self.assetBundleDownloader = nil
    
    dispatch_async(queue) {
      do {
        try self.moveDownloadedAssetBundleIntoPlace(assetBundle)
      } catch {
        NSLog("Could not move downloaded asset bundle into place: \(error)")
        return
      }
      
      self.didFinishDownloadingAssetBundle(assetBundle)
    }
  }
  
  func assetBundleDownloader(assetBundleDownloader: AssetBundleDownloader, didFailDownloadingWithError error: ErrorType) {
    self.assetBundleDownloader = nil
    
    dispatch_async(queue) {
      self.delegate?.assetBundleManager(self, didFailDownloadingBundleWithError: error)
    }
  }
}
