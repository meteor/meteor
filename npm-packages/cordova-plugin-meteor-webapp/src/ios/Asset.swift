struct Asset {
  let bundle: AssetBundle
  let filePath: String
  var fileURL: URL {
    return bundle.directoryURL.appendingPathComponent(filePath, isDirectory: false)
  }
  let urlPath: String
  let fileType: String?
  let cacheable: Bool
  let hash: String?
  let sourceMapURLPath: String?

  init(bundle: AssetBundle, filePath: String, urlPath: String, fileType: String? = nil,
      cacheable: Bool, hash: String? = nil, sourceMapURLPath: String? = nil) {
    self.bundle = bundle
    self.filePath = filePath
    self.urlPath = urlPath
    self.fileType = fileType
    self.cacheable = cacheable
    self.hash = hash
    self.sourceMapURLPath = sourceMapURLPath
  }
}

extension Asset: CustomStringConvertible {
  var description: String {
    return urlPath
  }
}

extension Asset: Hashable, Equatable {
  var hashValue: Int { return ObjectIdentifier(bundle).hashValue ^ urlPath.hashValue }
}

func ==(lhs: Asset, rhs: Asset) -> Bool {
  return ObjectIdentifier(lhs.bundle) == ObjectIdentifier(rhs.bundle)
    && lhs.urlPath == rhs.urlPath
}
