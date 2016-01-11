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

extension Asset: CustomStringConvertible {
  var description: String {
    return URLPath
  }
}

extension Asset: Hashable, Equatable {
  var hashValue: Int { return ObjectIdentifier(bundle).hashValue ^ URLPath.hashValue }
}

func ==(lhs: Asset, rhs: Asset) -> Bool {
  return ObjectIdentifier(lhs.bundle) == ObjectIdentifier(rhs.bundle)
    && lhs.URLPath == rhs.URLPath
}
