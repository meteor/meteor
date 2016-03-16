struct AssetManifest {
  struct Entry {
    let filePath: String
    let URLPath: String
    let fileType: String
    let cacheable: Bool
    let hash: String?
    let sourceMapPath: String?
    let sourceMapURLPath: String?
  }

  let version: String
  let cordovaCompatibilityVersion: String
  var entries: [Entry]

  init(fileURL: NSURL) throws {
    try self.init(data: try NSData(contentsOfURL: fileURL, options: []))
  }

  init(data: NSData) throws {
    let JSON: JSONObject
    do {
      JSON = try NSJSONSerialization.JSONObjectWithData(data, options: []) as! JSONObject
    } catch {
      throw WebAppError.InvalidAssetManifest(reason: "Error parsing asset manifest", underlyingError: error)
    }

    if let format = JSON["format"] as? String where format != "web-program-pre1" {
      throw WebAppError.InvalidAssetManifest(reason: "The asset manifest format is incompatible: \(format)", underlyingError: nil)
    }

    guard let version = JSON["version"] as? String else {
      throw WebAppError.InvalidAssetManifest(reason: "Asset manifest does not have a version", underlyingError: nil)
    }
    
    self.version = version
    
    guard let cordovaCompatibilityVersions = JSON["cordovaCompatibilityVersions"] as? JSONObject,
      let cordovaCompatibilityVersion = cordovaCompatibilityVersions["ios"] as? String else {
      throw WebAppError.InvalidAssetManifest(reason: "Asset manifest does not have a cordovaCompatibilityVersion", underlyingError: nil)
    }
    
    self.cordovaCompatibilityVersion = cordovaCompatibilityVersion
    
    let entriesJSON = JSON["manifest"] as? [JSONObject] ?? []
    entries = []
    for entryJSON in entriesJSON {
      if entryJSON["where"] as? String != "client" { continue }

      if let URLPath = entryJSON["url"] as? String,
        let filePath = entryJSON["path"] as? String,
        let fileType = entryJSON["type"] as? String,
        let hash = entryJSON["hash"] as? String,
        let cacheable = entryJSON["cacheable"] as? Bool {
          let sourceMapPath = entryJSON["sourceMap"] as? String
          let sourceMapURLPath = entryJSON["sourceMapUrl"] as? String

          let entry = Entry(filePath: filePath, URLPath: URLPath,
            fileType: fileType, cacheable: cacheable, hash: hash,
            sourceMapPath: sourceMapPath, sourceMapURLPath: sourceMapURLPath)
          entries.append(entry)
      }
    }
  }
}
