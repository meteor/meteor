extension Collection {
  func find(_ predicate: (Self.Iterator.Element) throws -> Bool) rethrows -> Self.Iterator.Element? {
    return try index(where: predicate).map({self[$0]})
  }
}

typealias JSONObject = [String:AnyObject]

// Regex that matches the query string part of a URL
let queryStringRegEx = try! NSRegularExpression(pattern: "(/[^?]+).*", options: [])

func URLPathByRemovingQueryString(_ URLString: String) -> String {
  guard let match = queryStringRegEx.firstMatchInString(URLString) else {
    return URLString
  }
  return (URLString as NSString).substring(with: match.rangeAt(1))
}

// Regex that matches a SHA1 hash
let sha1HashRegEx = try! NSRegularExpression(pattern: "[0-9a-f]{40}", options: [])

// Regex that matches an ETag with a SHA1 hash
let ETagWithSha1HashRegEx = try! NSRegularExpression(pattern: "\"([0-9a-f]{40})\"", options: [])

func SHA1HashFromETag(_ ETag: String) -> String? {
  guard let match = ETagWithSha1HashRegEx.firstMatchInString(ETag) else {
    return nil
  }
  
  return (ETag as NSString).substring(with: match.rangeAt(1))
}

extension NSRegularExpression {
  func firstMatchInString(_ string: String) -> NSTextCheckingResult? {
    return firstMatch(in: string, options: [],
        range: NSRange(location: 0, length: string.utf16.count))
  }

  func matches(_ string: String) -> Bool {
    return firstMatchInString(string) != nil
  }
}

extension URL {
  var isDirectory: Bool? {
    let values = try? self.resourceValues(forKeys: [.isDirectoryKey])
    return values?.isDirectory
  }

  var isRegularFile: Bool? {
    let values = try? self.resourceValues(forKeys: [.isRegularFileKey])
    return values?.isRegularFile
  }
}

extension HTTPURLResponse {
  var isSuccessful: Bool {
    return (200..<300).contains(statusCode)
  }
}
