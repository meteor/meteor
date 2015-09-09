class Box<T>: NSObject {
  var value: T

  init(_ value: T) {
    self.value = value
  }
}

extension CollectionType {
  func find(@noescape predicate: (Self.Generator.Element) throws -> Bool) rethrows -> Self.Generator.Element? {
    return try indexOf(predicate).map({self[$0]})
  }
}

func dispatch_sync(queue: dispatch_queue_t, block: () throws -> ()) throws {
  var caughtError: ErrorType?
  
  dispatch_sync(queue) {
    do {
      try block()
    } catch {
      caughtError = error
    }
  }
  
  if let caughtError = caughtError {
    throw caughtError
  }
}

typealias JSONObject = [String:AnyObject]

// Regex that matches the query string part of a URL
let queryStringRegEx = try! NSRegularExpression(pattern: "(/[^?]+).*", options: [])

func URLPathByRemovingQueryString(URLString: String) -> String {
  guard let match = queryStringRegEx.firstMatchInString(URLString) else {
    return URLString
  }
  return (URLString as NSString).substringWithRange(match.rangeAtIndex(1))
}

// Regex that matches a SHA1 hash
let sha1HashRegEx = try! NSRegularExpression(pattern: "[0-9a-f]{40}", options: [])

extension NSRegularExpression {
  func firstMatchInString(string: String) -> NSTextCheckingResult? {
    return firstMatchInString(string, options: [],
        range: NSRange(location: 0, length: string.utf16.count))
  }

  func matches(string: String) -> Bool {
    return firstMatchInString(string) != nil
  }
}

extension NSURL {
  var isDirectory: Bool? {
    return resourceValueAsBoolForKey(NSURLIsDirectoryKey)
  }

  var isRegularFile: Bool? {
    return resourceValueAsBoolForKey(NSURLIsRegularFileKey)
  }

  private func resourceValueAsBoolForKey(key: String) -> Bool? {
    do {
      var valueObject: AnyObject?
      try getResourceValue(&valueObject, forKey: key)
      guard let value = valueObject?.boolValue else { return nil }
      return value
    } catch {
      return nil
    }
  }
}
