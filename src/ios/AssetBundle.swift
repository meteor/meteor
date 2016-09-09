/// Regex used to extract __meteor_runtime_config__ from index.html
private let configJSONRegEx = try! NSRegularExpression(
  pattern: "__meteor_runtime_config__ = JSON.parse\\(decodeURIComponent\\(\"([^\"]*)\"\\)\\)",
  options: [])

/// Load the runtime config by extracting and parsing
/// `__meteor_runtime_config__` from index.html
func loadRuntimeConfigFromIndexFileAtURL(_ fileURL: URL) throws -> AssetBundle.RuntimeConfig {
  do {
    let indexFileString = try NSString(contentsOf: fileURL, encoding: String.Encoding.utf8.rawValue)
    guard
      let match  = configJSONRegEx.firstMatchInString(indexFileString as String),
      let configString = (indexFileString.substring(with: match.rangeAt(1)) as NSString).removingPercentEncoding,
      let configData = configString.data(using: String.Encoding.utf8)
      else { throw WebAppError.unsuitableAssetBundle(reason: "Couldn't load runtime config from index file", underlyingError: nil) }
    return AssetBundle.RuntimeConfig(json: try JSONSerialization.jsonObject(with: configData, options: []) as! JSONObject)
  } catch {
    throw WebAppError.unsuitableAssetBundle(reason: "Couldn't load runtime config from index file", underlyingError: error)
  }
}

final class AssetBundle {
  private(set) var directoryURL: URL

  let version: String
  let cordovaCompatibilityVersion: String

  private var parentAssetBundle: AssetBundle?
  private var ownAssetsByURLPath: [String: Asset] = [:]
  private(set) var indexFile: Asset?

  var ownAssets: [Asset] {
    return Array(ownAssetsByURLPath.values)
  }

  convenience init(directoryURL: URL, parentAssetBundle: AssetBundle? = nil) throws {
    let manifestURL = directoryURL.appendingPathComponent("program.json")
    let manifest = try AssetManifest(fileURL: manifestURL)
    try self.init(directoryURL: directoryURL, manifest: manifest, parentAssetBundle: parentAssetBundle)
  }

  init(directoryURL: URL, manifest: AssetManifest, parentAssetBundle: AssetBundle? = nil) throws {
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
          urlPath: URLPath,
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
            urlPath: sourceMapURLPath,
            fileType: "json",
            cacheable: true)
          addAsset(sourceMap)
        }
      }
    }

    let indexFile = Asset(bundle: self, filePath: "index.html", urlPath: "/", fileType: "html", cacheable: false, hash: nil)
    addAsset(indexFile)
    self.indexFile = indexFile
  }

  func addAsset(_ asset: Asset) {
    ownAssetsByURLPath[asset.urlPath] = asset
  }

  func assetForURLPath(_ URLPath: String) -> Asset? {
    return ownAssetsByURLPath[URLPath] ?? parentAssetBundle?.assetForURLPath(URLPath)
  }

  func cachedAssetForURLPath(_ URLPath: String, hash: String? = nil) -> Asset? {
    if let asset = ownAssetsByURLPath[URLPath],
        // If the asset is not cacheable, we require a matching hash
        (asset.cacheable || asset.hash != nil) && asset.hash == hash {
      return asset
    } else {
      return nil
    }
  }
  
  struct RuntimeConfig {
    private let json: JSONObject
    
    init(json: JSONObject) {
      self.json = json
    }
    
    var appId: String? {
      return json["appId"] as? String
    }
    
    var rootURL: URL? {
      if let rootURLString = json["ROOT_URL"] as? String {
        return URL(string: rootURLString)
      } else {
        return nil
      }
    }
    
    var autoupdateVersionCordova: String? {
      return json["autoupdateVersionCordova"] as? String
    }
  }
  
  /// The runtime config is lazily initialized by loading it from the index.html
  lazy var runtimeConfig: RuntimeConfig? = {
    guard let indexFile = self.indexFile else { return nil }
    
    do {
      return try loadRuntimeConfigFromIndexFileAtURL(indexFile.fileURL as URL)
    } catch {
      NSLog("\(error)")
      return nil
    }
  }()
  
  var appId: String? {
    return runtimeConfig?.appId
  }
  
  var rootURL: URL? {
    return runtimeConfig?.rootURL
  }

  func didMoveToDirectoryAtURL(_ directoryURL: URL) {
    self.directoryURL = directoryURL
  }
}
