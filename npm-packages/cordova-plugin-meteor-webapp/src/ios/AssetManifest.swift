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

  /// The file URL APIs append manifest paths literally.
  static func isValidFilePath(_ filePath: String) -> Bool {
    return !filePath.isEmpty && !filePath.hasPrefix("/") && !filePath.contains("\0") &&
      !filePath.components(separatedBy: "/").contains("..")
  }

  /// Requires one safe directory name.
  static func isValidVersion(_ version: String) -> Bool {
    return !version.isEmpty && version != "." && version != ".." && !version.contains("/") &&
      !version.contains("\0") && version != "Downloading" && version != "PartialDownload"
  }

  init(fileURL: URL) throws {
    try self.init(data: try Data(contentsOf: fileURL, options: []))
  }

  init(data: Data) throws {
    let JSON: JSONObject
    do {
      JSON = try JSONSerialization.jsonObject(with: data, options: []) as! JSONObject
    } catch {
      throw WebAppError.invalidAssetManifest(reason: "Error parsing asset manifest", underlyingError: error)
    }

    if let format = JSON["format"] as? String, format != "web-program-pre1" {
      throw WebAppError.invalidAssetManifest(reason: "The asset manifest format is incompatible: \(format)", underlyingError: nil)
    }

    guard let version = JSON["version"] as? String else {
      throw WebAppError.invalidAssetManifest(reason: "Asset manifest does not have a version", underlyingError: nil)
    }
    
    self.version = version
    
    guard let cordovaCompatibilityVersions = JSON["cordovaCompatibilityVersions"] as? JSONObject,
      let cordovaCompatibilityVersion = cordovaCompatibilityVersions["ios"] as? String else {
      throw WebAppError.invalidAssetManifest(reason: "Asset manifest does not have a cordovaCompatibilityVersion", underlyingError: nil)
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

          for path in [filePath, sourceMapPath] {
            if let path = path, !AssetManifest.isValidFilePath(path) {
              throw WebAppError.invalidAssetManifest(reason: "Asset manifest contains an invalid file path: \(path)", underlyingError: nil)
            }
          }

          let entry = Entry(filePath: filePath, URLPath: URLPath,
            fileType: fileType, cacheable: cacheable, hash: hash,
            sourceMapPath: sourceMapPath, sourceMapURLPath: sourceMapURLPath)
          entries.append(entry)
      }
    }
  }
}
