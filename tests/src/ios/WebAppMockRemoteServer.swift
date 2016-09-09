extension Data {
  func SHA1() -> String {
    var digest = [UInt8](repeating: 0, count: Int(CC_SHA1_DIGEST_LENGTH))
    
    withUnsafeBytes { (bytes) -> Void in
      CC_SHA1(bytes, CC_LONG(count), &digest)
    }
    
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
  var versionDirectoryURL: URL!
  var receivedRequests: [GCDWebServerRequest]?

  override func pluginInitialize() {
    super.pluginInitialize()

    server = GCDWebServer()
    server.delegate = self
    // setLogLevel for some reason expects an int instead of an enum
    GCDWebServer.setLogLevel(GCDWebServerLoggingLevel.info.rawValue)
    addHandler()
  }

  func startServer() {
    do {
      let port = 3000
      let options = [
        GCDWebServerOption_Port: port as NSNumber,
        GCDWebServerOption_BindToLocalhost: true]
      try server.start(options: options)
    } catch let error as NSError {
      print("Could not start local web server: \(error)")
    }
  }

  // MARK: Public plugin API

  func serveVersion(_ command: CDVInvokedUrlCommand) {
    guard let version = command.arguments[0] as? String else {
      let message = "'version' argument required"
      let result = CDVPluginResult(status: CDVCommandStatus_ERROR, messageAs:message)
      commandDelegate?.send(result, callbackId:command.callbackId)
      return
    }

    NSLog("WebAppMockRemoteServer.serveVersion: \(version)")

    let wwwDirectoryURL = Bundle.main.resourceURL!.appendingPathComponent("www")
    versionDirectoryURL = wwwDirectoryURL.appendingPathComponent("downloadable_versions/\(version)")

    if server.isRunning {
      server.stop()
    }

    startServer()

    let result = CDVPluginResult(status: CDVCommandStatus_OK)
    commandDelegate?.send(result, callbackId:command.callbackId)
  }

  func addHandler() {
    let fileManager = FileManager.default
    let basePath = "/__cordova/"

    server.addHandler(match: {(requestMethod, requestURL, requestHeaders, URLPath, URLQuery) -> GCDWebServerRequest! in
      if requestMethod != "GET" { return nil }
      if !(URLPath?.hasPrefix(basePath))! { return nil }

      let request = GCDWebServerRequest(method: requestMethod, url: requestURL, headers: requestHeaders, path: URLPath, query: URLQuery)
      return request
      }) { (request) -> GCDWebServerResponse! in
        let URLPath = request?.path.substring(from: basePath.endIndex)
        let fileURL = self.versionDirectoryURL.appendingPathComponent(URLPath!)

        var response: GCDWebServerResponse

        var isDirectory = ObjCBool(false)
        if fileManager.fileExists(atPath: fileURL.path, isDirectory: &isDirectory)
            && !isDirectory.boolValue {
          response = GCDWebServerFileResponse(file: fileURL.path)
          let fileHash = (try! Data(contentsOf: fileURL)).SHA1()
          response.eTag = "\"\(fileHash)\""
        } else if request?.query["meteor_dont_serve_index"] == nil {
          let indexFileURL = self.versionDirectoryURL.appendingPathComponent("index.html")
          response = GCDWebServerFileResponse(file: indexFileURL.path)
        } else {
          response = GCDWebServerResponse(statusCode: GCDWebServerClientErrorHTTPStatusCode.httpStatusCode_NotFound.rawValue)
        }

        response.cacheControlMaxAge = 0
        response.lastModifiedDate = nil
        return response
    }
  }

  func receivedRequests(_ command: CDVInvokedUrlCommand) {
    let receivedRequestURLs = receivedRequests!.map {
      ["path": $0.path, "query": $0.query, "headers": $0.headers]
    }

    let result = CDVPluginResult(status: CDVCommandStatus_OK, messageAs: receivedRequestURLs)
    commandDelegate?.send(result, callbackId:command.callbackId)
  }

  // MARK: GCDWebServerTestingDelegate

  func webServerDidStart(_ server: GCDWebServer!) {
    receivedRequests = [GCDWebServerRequest]()
  }

  func webServer(_ server: GCDWebServer!, didReceive request: GCDWebServerRequest!) {
    receivedRequests?.append(request)
  }
}
