extension NSData {
  func SHA1() -> String {
    var digest = [UInt8](count: Int(CC_SHA1_DIGEST_LENGTH), repeatedValue: 0)
    CC_SHA1(bytes, CC_LONG(length), &digest)

    var hexString = ""
    for index in 0..<digest.count {
      hexString += String(format: "%02x", digest[index])
    }
    return hexString
  }
}

@objc(METWebAppMockRemoteServer)
class WebAppMockRemoteServer: CDVPlugin, GCDWebServerTestingDelegate {
  var server: GCDWebServer!
  var versionDirectoryURL: NSURL!
  var receivedRequests: [GCDWebServerRequest]?

  override func pluginInitialize() {
    super.pluginInitialize()

    server = GCDWebServer()
    server.delegate = self
    // setLogLevel for some reason expects an int instead of an enum
    GCDWebServer.setLogLevel(GCDWebServerLoggingLevel.Info.rawValue)
    addHandler()
  }

  func startServer() {
    do {
      let port = 3000
      let options = [
        GCDWebServerOption_Port: port as NSNumber,
        GCDWebServerOption_BindToLocalhost: true]
      try server.startWithOptions(options)
    } catch let error as NSError {
      print("Could not start local web server: \(error)")
    }
  }

  // MARK: Public plugin API

  func serveVersion(command: CDVInvokedUrlCommand) {
    guard let version = command.arguments[0] as? String else {
      let message = "'version' argument required"
      let result = CDVPluginResult(status: CDVCommandStatus_ERROR, messageAsString:message)
      commandDelegate?.sendPluginResult(result, callbackId:command.callbackId)
      return
    }

    NSLog("WebAppMockRemoteServer.serveVersion: \(version)")

    let wwwDirectoryURL = NSBundle.mainBundle().resourceURL!.URLByAppendingPathComponent("www")
    versionDirectoryURL = wwwDirectoryURL.URLByAppendingPathComponent("downloadable_versions/\(version)")

    if server.running {
      server.stop()
    }

    startServer()

    let result = CDVPluginResult(status: CDVCommandStatus_OK)
    commandDelegate?.sendPluginResult(result, callbackId:command.callbackId)
  }

  func addHandler() {
    let fileManager = NSFileManager.defaultManager()
    let basePath = "/__cordova/"

    server.addHandlerWithMatchBlock({(requestMethod, requestURL, requestHeaders, URLPath, URLQuery) -> GCDWebServerRequest! in
      if requestMethod != "GET" { return nil }
      if !URLPath.hasPrefix(basePath) { return nil }

      let request = GCDWebServerRequest(method: requestMethod, url: requestURL, headers: requestHeaders, path: URLPath, query: URLQuery)
      return request
      }) { (request) -> GCDWebServerResponse! in
        let URLPath = request.path.substringFromIndex(basePath.endIndex)
        let fileURL = self.versionDirectoryURL.URLByAppendingPathComponent(URLPath)

        var response: GCDWebServerResponse

        var isDirectory = ObjCBool(false)
        if fileManager.fileExistsAtPath(fileURL.path!, isDirectory: &isDirectory)
            && !isDirectory.boolValue {
          response = GCDWebServerFileResponse(file: fileURL.path!)
          let fileHash = NSData(contentsOfURL: fileURL)!.SHA1()
          response.eTag = "\"\(fileHash)\""
        } else if request.query["meteor_dont_serve_index"] == nil {
          let indexFileURL = self.versionDirectoryURL.URLByAppendingPathComponent("index.html")
          response = GCDWebServerFileResponse(file: indexFileURL.path!)
        } else {
          response = GCDWebServerResponse(statusCode: GCDWebServerClientErrorHTTPStatusCode.HTTPStatusCode_NotFound.rawValue)
        }

        response.cacheControlMaxAge = 0
        response.lastModifiedDate = nil
        return response
    }
  }

  func receivedRequests(command: CDVInvokedUrlCommand) {
    let receivedRequestURLs = receivedRequests!.map {
      ["path": $0.path, "query": $0.query, "headers": $0.headers]
    }

    let result = CDVPluginResult(status: CDVCommandStatus_OK, messageAsArray: receivedRequestURLs)
    commandDelegate?.sendPluginResult(result, callbackId:command.callbackId)
  }

  // MARK: GCDWebServerTestingDelegate

  func webServerDidStart(server: GCDWebServer!) {
    receivedRequests = [GCDWebServerRequest]()
  }

  func webServer(server: GCDWebServer!, didReceiveRequest request: GCDWebServerRequest!) {
    receivedRequests?.append(request)
  }
}
