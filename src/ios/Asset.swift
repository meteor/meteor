struct Asset {
  let bundle: AssetBundle
  let filePath: String
  var fileURL: NSURL {
    return bundle.directoryURL.URLByAppendingPathComponent(filePath,
      isDirectory: false)
  }
  let URLPath: String
  let fileType: String?
  let cacheable: Bool
  let hash: String?
  let sourceMapURLPath: String?

  init(bundle: AssetBundle, filePath: String, URLPath: String, fileType: String? = nil,
      cacheable: Bool, hash: String? = nil, sourceMapURLPath: String? = nil) {
    self.bundle = bundle
    self.filePath = filePath
    self.URLPath = URLPath
    self.fileType = fileType
    self.cacheable = cacheable
    self.hash = hash
    self.sourceMapURLPath = sourceMapURLPath
  }
}
