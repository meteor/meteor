/// Regex used to extract __meteor_runtime_config__ from index.html
private let configJSONRegEx = try! NSRegularExpression(
  pattern: "__meteor_runtime_config__ = JSON.parse\\(decodeURIComponent\\(\"([^\"]*)\"\\)\\)",
  options: [])

/// Load the runtime config by extracting and parsing
/// `__meteor_runtime_config__` from index.html
func loadRuntimeConfigFromIndexFileAtURL(fileURL: NSURL) throws -> AssetBundle.RuntimeConfig {
  do {
    let indexFileString = try NSString(contentsOfURL: fileURL, encoding: NSUTF8StringEncoding)
    guard
      let match  = configJSONRegEx.firstMatchInString(indexFileString as String),
      let configString = (indexFileString.substringWithRange(match.rangeAtIndex(1)) as NSString).stringByRemovingPercentEncoding,
      let configData = configString.dataUsingEncoding(NSUTF8StringEncoding)
      else { throw WebAppError.UnsuitableAssetBundle(reason: "Couldn't load runtime config from index file", underlyingError: nil) }
    return AssetBundle.RuntimeConfig(JSON: try NSJSONSerialization.JSONObjectWithData(configData, options: []) as! JSONObject)
  } catch {
    throw WebAppError.UnsuitableAssetBundle(reason: "Couldn't load runtime config from index file", underlyingError: error)
  }
}

final class AssetBundle {
  private(set) var directoryURL: NSURL

  let version: String
  let cordovaCompatibilityVersion: String

  private var parentAssetBundle: AssetBundle?
  private var ownAssetsByURLPath: [String: Asset] = [:]
  private(set) var indexFile: Asset?

  var ownAssets: [Asset] {
    return Array(ownAssetsByURLPath.values)
  }

  convenience init(directoryURL: NSURL, parentAssetBundle: AssetBundle? = nil) throws {
    let manifestURL = directoryURL.URLByAppendingPathComponent("program.json")
    let manifest = try AssetManifest(fileURL: manifestURL)
    try self.init(directoryURL: directoryURL, manifest: manifest, parentAssetBundle: parentAssetBundle)
  }

  init(directoryURL: NSURL, manifest: AssetManifest, parentAssetBundle: AssetBundle? = nil) throws {
    self.directoryURL = directoryURL
    self.parentAssetBundle = parentAssetBundle
    
    self.version = manifest.version
    self.cordovaCompatibilityVersion = manifest.cordovaCompatibilityVersion

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
    if let asset = ownAssetsByURLPath[URLPath]
        // If the asset is not cacheable, we require a matching hash
        where (asset.cacheable || asset.hash != nil) && asset.hash == hash {
      return asset
    } else {
      return nil
    }
  }
  
  struct RuntimeConfig {
    private let JSON: JSONObject
    
    var appId: String? {
      return JSON["appId"] as? String
    }
    
    var rootURL: NSURL? {
      if let rootURLString = JSON["ROOT_URL"] as? String {
        return NSURL(string: rootURLString)
      } else {
        return nil
      }
    }
    
    var autoupdateVersionCordova: String? {
      return JSON["autoupdateVersionCordova"] as? String
    }
  }
  
  /// The runtime config is lazily initialized by loading it from the index.html
  lazy var runtimeConfig: RuntimeConfig? = {
    guard let indexFile = self.indexFile else { return nil }
    
    do {
      return try loadRuntimeConfigFromIndexFileAtURL(indexFile.fileURL)
    } catch {
      NSLog("\(error)")
      return nil
    }
  }()
  
  var appId: String? {
    return runtimeConfig?.appId
  }
  
  var rootURL: NSURL? {
    return runtimeConfig?.rootURL
  }

  func didMoveToDirectoryAtURL(directoryURL: NSURL) {
    self.directoryURL = directoryURL
  }
}
