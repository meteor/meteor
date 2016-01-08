/// Regex used to extract __meteor_runtime_config__ from index.html
private let configJSONRegEx = try! NSRegularExpression(
  pattern: "__meteor_runtime_config__ = JSON.parse\\(decodeURIComponent\\(\"([^\"]*)\"\\)\\)",
  options: [])

/// Load the runtime config by extracting and parsing
/// `__meteor_runtime_config__` from index.html
func loadRuntimeConfigFromIndexFileAtURL(fileURL: NSURL) -> JSONObject? {
  guard
    let indexFileString = try? NSString(contentsOfURL: fileURL, encoding: NSUTF8StringEncoding),
    let match  = configJSONRegEx.firstMatchInString(indexFileString as String),
    let configString = (indexFileString.substringWithRange(match.rangeAtIndex(1)) as NSString).stringByRemovingPercentEncoding,
    let configData = configString.dataUsingEncoding(NSUTF8StringEncoding)
    else { return nil }
  
  return try? NSJSONSerialization.JSONObjectWithData(configData, options: []) as! JSONObject
}

final class AssetBundle {
  private(set) var directoryURL: NSURL

  var version: String?

  private var parentAssetBundle: AssetBundle?
  private var ownAssetsByURLPath: [String: Asset] = [:]
  private(set) var indexFile: Asset?

  var ownAssets: [Asset] {
    return Array(ownAssetsByURLPath.values)
  }

  convenience init(directoryURL: NSURL, parentAssetBundle: AssetBundle? = nil) throws {
    let manifestURL = directoryURL.URLByAppendingPathComponent("program.json")
    let manifest = try AssetManifest(fileURL: manifestURL)
    self.init(directoryURL: directoryURL, manifest: manifest, parentAssetBundle: parentAssetBundle)
  }

  init(directoryURL: NSURL, manifest: AssetManifest, parentAssetBundle: AssetBundle? = nil) {
    self.directoryURL = directoryURL
    self.parentAssetBundle = parentAssetBundle

    version = manifest.version

    for entry in manifest.entries {
      let URLPath = URLPathByRemovingQueryString(entry.URLPath)

      if parentAssetBundle?.cachedAssetForURLPath(URLPath, hash: entry.hash) == nil {
        let asset = Asset(
          bundle: self,
          filePath: entry.filePath,
          URLPath: URLPath,
          fileType: entry.fileType,
          cacheable: entry.cacheable,
          hash: entry.hash,
          sourceMapURLPath: entry.sourceMapURLPath)
        addAsset(asset)
      }

      if let sourceMapPath = entry.sourceMapPath,
          let sourceMapURLPath = entry.sourceMapURLPath {
        if parentAssetBundle?.cachedAssetForURLPath(sourceMapURLPath) == nil {
          let sourceMap = Asset(
            bundle: self,
            filePath: sourceMapPath,
            URLPath: sourceMapURLPath,
            fileType: "json",
            cacheable: true)
          addAsset(sourceMap)
        }
      }
    }

    let indexFile = Asset(bundle: self, filePath: "index.html", URLPath: "/", fileType: "html", cacheable: false, hash: nil)
    addAsset(indexFile)
    self.indexFile = indexFile
  }

  func addAsset(asset: Asset) {
    ownAssetsByURLPath[asset.URLPath] = asset
  }

  func assetForURLPath(URLPath: String) -> Asset? {
    return ownAssetsByURLPath[URLPath] ?? parentAssetBundle?.assetForURLPath(URLPath)
  }

  func cachedAssetForURLPath(URLPath: String, hash: String? = nil) -> Asset? {
    if let cachedAsset = ownAssetsByURLPath[URLPath]
        // If the asset is not cacheable, we require a matching hash
        where (cachedAsset.cacheable || cachedAsset.hash != nil) && cachedAsset.hash == hash {
      return cachedAsset
    } else {
      return nil
    }
  }
  
  /// The runtime config is lazily initialized by loading it from the index.html
  lazy var runtimeConfig: JSONObject? = {
    guard let indexFile = self.indexFile else { return nil }
    
    return loadRuntimeConfigFromIndexFileAtURL(indexFile.fileURL)
  }()

  func didMoveToDirectoryAtURL(directoryURL: NSURL) {
    self.directoryURL = directoryURL
  }
}
