import WebKit

let oneYearInSeconds = 60 * 60 * 24 * 365

let GCDWebServerRequestAttribute_Asset = "GCDWebServerRequestAttribute_Asset"
let GCDWebServerRequestAttribute_FilePath = "GCDWebServerRequestAttribute_FilePath"

let localFileSystemPath = "/local-filesystem"

@objc(METWebAppLocalServer)
public class WebAppLocalServer: METPlugin, AssetBundleManagerDelegate {
  /// The local web server responsible for serving assets to the web app
  private(set) var localServer: GCDWebServer!

  /// The listening port of the local web server
  private var localServerPort: UInt = 0

  let authTokenKeyValuePair: String = {
    let authToken = NSProcessInfo.processInfo().globallyUniqueString
    return "cdvToken=\(authToken)"
  }()

  /// The www directory in the app bundle
  private(set) var wwwDirectoryURL: NSURL!

  /// Persistent configuration settings for the webapp
  private(set) var configuration: WebAppConfiguration!

  /// The asset bundle manager is responsible for managing asset bundles
  /// and checking for updates
  private(set) var assetBundleManager: AssetBundleManager!

  /// The asset bundle currently used to serve assets from
  private var currentAssetBundle: AssetBundle! {
    didSet {
      if currentAssetBundle != nil {
        configuration.appId = currentAssetBundle.appId
        configuration.rootURL = currentAssetBundle.rootURL
        configuration.cordovaCompatibilityVersion = currentAssetBundle.cordovaCompatibilityVersion
        
        NSLog("Serving asset bundle version: \(currentAssetBundle.version)")
      }
    }
  }

  /// Downloaded asset bundles are considered pending until the next page reload
  /// because we don't want the app to end up in an inconsistent state by
  /// loading assets from different bundles.
  private var pendingAssetBundle: AssetBundle?

  /// Callback ID used to send a newVersionReady notification to JavaScript
  var newVersionReadyCallbackId: String?

  /// Callback ID used to send an error notification to JavaScript
  var errorCallbackId: String?

  /// Timer used to wait for startup to complete after a reload
  private var startupTimer: METTimer?

  /// The number of seconds to wait for startup to complete, after which
  /// we revert to the last known good version
  private var startupTimeoutInterval: NSTimeInterval = 20.0

  private var isTesting: Bool = false

  // MARK: - Lifecycle

  /// Called by Cordova on plugin initialization
  override public func pluginInitialize() {
    super.pluginInitialize()

    // Detect whether we are testing the app using
    // cordova-plugin-test-framework
    if let viewController = self.viewController as? CDVViewController
      where viewController.startPage == "cdvtests/index.html" {
        isTesting = true
    }

    configuration = WebAppConfiguration()

    wwwDirectoryURL = NSBundle.mainBundle().resourceURL!.URLByAppendingPathComponent("www")

    initializeAssetBundles()

    // The WebAppLocalServerPort setting is currently only used for testing
    if let portString = (commandDelegate?.settings["WebAppLocalServerPort".lowercaseString] as? String),
       let localServerPort = UInt(portString) {
      self.localServerPort = localServerPort
    // In all other cases, we use a listening port that has been set during build
    // and that is determined based on the appId. Hopefully this will avoid
    // collisions between Meteor apps installed on the same device
    } else if let viewController = self.viewController as? CDVViewController,
        let port = NSURLComponents(string: viewController.startPage)?.port {
      localServerPort = port.unsignedIntegerValue
    }

    do {
      try startLocalServer()
    } catch {
      NSLog("Could not start local server: \(error)")
      return
    }

    if let startupTimeoutString = (commandDelegate?.settings["WebAppStartupTimeout".lowercaseString] as? String),
       let startupTimeoutMilliseconds = UInt(startupTimeoutString) {
      startupTimeoutInterval =  NSTimeInterval(startupTimeoutMilliseconds / 1000)
    }

    if !isTesting {
      startupTimer = METTimer(queue: dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0)) { [weak self] in
        NSLog("App startup timed out, reverting to last known good version")
        self?.revertToLastKnownGoodVersion()
      }
    }

    NSNotificationCenter.defaultCenter().addObserver(self, selector: "applicationDidEnterBackground", name: UIApplicationDidEnterBackgroundNotification, object: nil)

    NSNotificationCenter.defaultCenter().addObserver(self, selector: "pageDidLoad", name: CDVPageDidLoadNotification, object: webView)
  }

  func initializeAssetBundles() {
    assetBundleManager = nil;

    // The initial asset bundle consists of the assets bundled with the app
    let initialAssetBundle: AssetBundle
    do {
      let directoryURL = wwwDirectoryURL.URLByAppendingPathComponent("application")
      initialAssetBundle = try AssetBundle(directoryURL: directoryURL)
    } catch {
      NSLog("Could not load initial asset bundle: \(error)")
      return
    }

    let fileManager = NSFileManager.defaultManager()

    // Downloaded versions are stored in Library/NoCloud/meteor
    let libraryDirectoryURL = NSFileManager.defaultManager().URLsForDirectory(.LibraryDirectory, inDomains: .UserDomainMask).first!
    let versionsDirectoryURL = libraryDirectoryURL.URLByAppendingPathComponent("NoCloud/meteor")

    // If the last seen initial version is different from the currently bundled
    // version, we delete the versions directory and unset lastDownloadedVersion
    // and blacklistedVersions
    if configuration.lastSeenInitialVersion != initialAssetBundle.version {
      do {
        if fileManager.fileExistsAtPath(versionsDirectoryURL.path!) {
          try fileManager.removeItemAtURL(versionsDirectoryURL)
        }
      } catch {
        NSLog("Could not remove versions directory: \(error)")
      }

      configuration.reset()
    }

    // We keep track of the last seen initial version (see above)
    configuration.lastSeenInitialVersion = initialAssetBundle.version

    // If the versions directory does not exist, we create it
    do {
      if !fileManager.fileExistsAtPath(versionsDirectoryURL.path!) {
        try fileManager.createDirectoryAtURL(versionsDirectoryURL, withIntermediateDirectories: true, attributes: nil)
      }
    } catch {
      NSLog("Could not create versions directory: \(error)")
      return
    }

    assetBundleManager = AssetBundleManager(configuration: configuration, versionsDirectoryURL: versionsDirectoryURL, initialAssetBundle: initialAssetBundle)
    assetBundleManager.delegate = self

    // If a last downloaded version has been set and the asset bundle exists,
    // we set it as the current asset bundle
    if let lastDownloadedVersion = configuration.lastDownloadedVersion,
      let downloadedAssetBundle = assetBundleManager.downloadedAssetBundleWithVersion(lastDownloadedVersion) {
        currentAssetBundle = downloadedAssetBundle
    } else {
      currentAssetBundle = initialAssetBundle
    }

    pendingAssetBundle = nil
  }

  /// Called by Cordova before page reload
  override public func onReset() {
    super.onReset()

    // Clear existing callbacks
    newVersionReadyCallbackId = nil
    errorCallbackId = nil

    // If there is a pending asset bundle, we make it the current
    if let pendingAssetBundle = pendingAssetBundle {
      currentAssetBundle = pendingAssetBundle
      self.pendingAssetBundle = nil
    }

    startupTimer?.startWithTimeInterval(startupTimeoutInterval)
  }

  // MARK: - Notifications

  func pageDidLoad() {
  }

  func applicationDidEnterBackground() {
    // Stop startup timer when going into the background, to avoid
    // blacklisting a version just because the web view has been suspended
    startupTimer?.stop()
  }

  // MARK: - Public plugin commands

  public func startupDidComplete(command: CDVInvokedUrlCommand) {
    startupTimer?.stop()

    // If startup completed successfully, we consider a version good
    configuration.lastKnownGoodVersion = currentAssetBundle.version

    commandDelegate?.runInBackground() {
      do {
        try self.assetBundleManager.removeAllDownloadedAssetBundlesExceptFor(self.currentAssetBundle)
      } catch {
        NSLog("Could not remove unused asset bundles: \(error)")
      }
    }

    let result = CDVPluginResult(status: CDVCommandStatus_OK)
    self.commandDelegate?.sendPluginResult(result, callbackId: command.callbackId)
  }

  public func checkForUpdates(command: CDVInvokedUrlCommand) {
    guard let rootURL = configuration.rootURL else {
      let errorMessage = "checkForUpdates requires a rootURL to be configured"
      let result = CDVPluginResult(status: CDVCommandStatus_ERROR, messageAsString: errorMessage)
      commandDelegate?.sendPluginResult(result, callbackId: command.callbackId)
      return
    }

    let baseURL = rootURL.URLByAppendingPathComponent("__cordova/")
    assetBundleManager.checkForUpdatesWithBaseURL(baseURL)

    let result = CDVPluginResult(status: CDVCommandStatus_OK)
    commandDelegate?.sendPluginResult(result, callbackId: command.callbackId)
  }

  public func onNewVersionReady(command: CDVInvokedUrlCommand) {
    newVersionReadyCallbackId = command.callbackId

    let result = CDVPluginResult(status: CDVCommandStatus_NO_RESULT)
    // This allows us to invoke the callback later
    result.setKeepCallbackAsBool(true)
    commandDelegate?.sendPluginResult(result, callbackId: newVersionReadyCallbackId)
  }

  private func notifyNewVersionReady(version: String?) {
    guard let newVersionReadyCallbackId = newVersionReadyCallbackId else { return }

    let result = CDVPluginResult(status: CDVCommandStatus_OK, messageAsString: version)
    // This allows us to invoke the callback later
    result.setKeepCallbackAsBool(true)
    commandDelegate?.sendPluginResult(result, callbackId: newVersionReadyCallbackId)
  }

  public func onError(command: CDVInvokedUrlCommand) {
    errorCallbackId = command.callbackId

    let result = CDVPluginResult(status: CDVCommandStatus_NO_RESULT)
    // This allows us to invoke the callback later
    result.setKeepCallbackAsBool(true)
    commandDelegate?.sendPluginResult(result, callbackId: errorCallbackId)
  }

  private func notifyError(error: ErrorType) {
    NSLog("Download failure: \(error)")

    guard let errorCallbackId = errorCallbackId else { return }

    let errorMessage = String(error)
    let result = CDVPluginResult(status: CDVCommandStatus_OK, messageAsString: errorMessage)
    // This allows us to invoke the callback later
    result.setKeepCallbackAsBool(true)
    commandDelegate?.sendPluginResult(result, callbackId: errorCallbackId)
  }

  // MARK: - Managing Versions

  func revertToLastKnownGoodVersion() {
    // Blacklist the current version, so we don't update to it again right away
    configuration.addBlacklistedVersion(currentAssetBundle.version)

    // If there is a last known good version and we can load the bundle, revert to it
    if let lastKnownGoodVersion = configuration.lastKnownGoodVersion,
        let lastKnownGoodAssetBundle = assetBundleManager.downloadedAssetBundleWithVersion(lastKnownGoodVersion) {
      pendingAssetBundle = lastKnownGoodAssetBundle
    // Else, revert to the initial asset bundle, unless that is what we are
    // currently serving
  } else if currentAssetBundle.version != assetBundleManager.initialAssetBundle.version {
      pendingAssetBundle = assetBundleManager.initialAssetBundle
    }

    // Only reload if we have a pending asset bundle to reload
    if pendingAssetBundle != nil {
      forceReload()
    }
  }

  func forceReload() {
    if let webView = self.webView as? WKWebView {
      webView.reloadFromOrigin()
    }
  }

  // MARK: AssetBundleManagerDelegate

  func assetBundleManager(assetBundleManager: AssetBundleManager, shouldDownloadBundleForManifest manifest: AssetManifest) -> Bool {
    // No need to redownload the current or the pending version
    if currentAssetBundle.version == manifest.version || pendingAssetBundle?.version == manifest.version {
      return false
    }

    // Don't download blacklisted versions
    if configuration.blacklistedVersions.contains(manifest.version) {
      notifyError(WebAppError.UnsuitableAssetBundle(reason: "Skipping downloading blacklisted version", underlyingError: nil))
      return false
    }
    
    // Don't download versions potentially incompatible with the bundled native code
    if manifest.cordovaCompatibilityVersion != configuration.cordovaCompatibilityVersion {
      notifyError(WebAppError.UnsuitableAssetBundle(reason: "Skipping downloading new version because the Cordova platform version or plugin versions have changed and are potentially incompatible", underlyingError: nil))
      return false
    }

    return true
  }

  func assetBundleManager(assetBundleManager: AssetBundleManager, didFinishDownloadingBundle assetBundle: AssetBundle) {
    NSLog("Finished downloading new asset bundle version: \(assetBundle.version)")

    configuration.lastDownloadedVersion = assetBundle.version
    pendingAssetBundle = assetBundle
    notifyNewVersionReady(assetBundle.version)
  }

  func assetBundleManager(assetBundleManager: AssetBundleManager, didFailDownloadingBundleWithError error: ErrorType) {
    notifyError(error)
  }

  // MARK: - Local server

  func startLocalServer() throws {
    localServer = GCDWebServer()
    // setLogLevel for some reason expects an int instead of an enum
    GCDWebServer.setLogLevel(GCDWebServerLoggingLevel.Info.rawValue)

    // Handlers are added last to first
    addNotFoundHandler()
    addIndexFileHandler()
    addHandlerForLocalFileSystem()
    addHandlerForWwwDirectory()
    addHandlerForAssetBundle()

    let options = [
      GCDWebServerOption_Port: NSNumber(unsignedInteger: localServerPort),
      GCDWebServerOption_BindToLocalhost: true]
    try localServer.startWithOptions(options)

    // Set localServerPort to the assigned port, in case it is different
    localServerPort = localServer.port

    if !isTesting, let viewController = self.viewController as? CDVViewController {
      // Do not modify startPage if we are testing the app using
      // cordova-plugin-test-framework
      viewController.startPage = "http://localhost:\(localServerPort)?\(authTokenKeyValuePair)"
    }
  }

  // MARK: Request Handlers

  private func addHandlerForAssetBundle() {
    localServer.addHandlerWithMatchBlock({ [weak self] (requestMethod, requestURL, requestHeaders, URLPath, URLQuery) -> GCDWebServerRequest! in
      if requestMethod != "GET" { return nil }
      guard let asset = self?.currentAssetBundle?.assetForURLPath(URLPath) else { return nil }

      let request = GCDWebServerRequest(method: requestMethod, url: requestURL, headers: requestHeaders, path: URLPath, query: URLQuery)
      request.setAttribute(Box(asset), forKey: GCDWebServerRequestAttribute_Asset)
      return request
    }) { (request) -> GCDWebServerResponse! in
        let asset = (request.attributeForKey(GCDWebServerRequestAttribute_Asset) as! Box<Asset>).value
        return self.responseForAsset(request, asset: asset)
    }
  }

  private func addHandlerForWwwDirectory() {
    localServer.addHandlerWithMatchBlock({ [weak self] (requestMethod, requestURL, requestHeaders, URLPath, URLQuery) -> GCDWebServerRequest! in
      if requestMethod != "GET" { return nil }

      // Do not serve files from /application, because these should only be served through the initial asset bundle
      if URLPath.hasPrefix("/application") { return nil }

      guard let fileURL = self?.wwwDirectoryURL?.URLByAppendingPathComponent(URLPath) else { return nil }
      if fileURL.isRegularFile != true { return nil }

      let request = GCDWebServerRequest(method: requestMethod, url: requestURL, headers: requestHeaders, path: URLPath, query: URLQuery)
      request.setAttribute(fileURL.path!, forKey: GCDWebServerRequestAttribute_FilePath)
      return request
    }) { (request) -> GCDWebServerResponse! in
      let filePath = request.attributeForKey(GCDWebServerRequestAttribute_FilePath) as! String
      return self.responseForFile(request, filePath: filePath, cacheable: false)
    }
  }

  private func addHandlerForLocalFileSystem() {
    localServer.addHandlerWithMatchBlock({ (requestMethod, requestURL, requestHeaders, URLPath, URLQuery) -> GCDWebServerRequest! in
      if requestMethod != "GET" { return nil }

      if !URLPath.hasPrefix(localFileSystemPath) { return nil }

      let filePath = URLPath.substringFromIndex(localFileSystemPath.endIndex)
      let fileURL = NSURL(fileURLWithPath: filePath)
      if fileURL.isRegularFile != true { return nil }

      let request = GCDWebServerRequest(method: requestMethod, url: requestURL, headers: requestHeaders, path: URLPath, query: URLQuery)
      request.setAttribute(filePath, forKey: GCDWebServerRequestAttribute_FilePath)
      return request
      }) { (request) -> GCDWebServerResponse! in
        let filePath = request.attributeForKey(GCDWebServerRequestAttribute_FilePath) as! String
        return self.responseForFile(request, filePath: filePath, cacheable: false)
    }
  }

  private func addIndexFileHandler() {
    localServer.addHandlerWithMatchBlock({ [weak self] (requestMethod, requestURL, requestHeaders, URLPath, URLQuery) -> GCDWebServerRequest! in
      if requestMethod != "GET" { return nil }

      // Don't serve index.html for local file system paths
      if URLPath.hasPrefix(localFileSystemPath) { return nil }

      if URLPath == "/favicon.ico" { return nil }

      guard let indexFile = self?.currentAssetBundle?.indexFile else { return nil }

      let request = GCDWebServerRequest(method: requestMethod, url: requestURL, headers: requestHeaders, path: URLPath, query: URLQuery)
      request.setAttribute(Box(indexFile), forKey: GCDWebServerRequestAttribute_Asset)
      return request
      }) { (request) -> GCDWebServerResponse! in
        let asset = (request.attributeForKey(GCDWebServerRequestAttribute_Asset) as! Box<Asset>).value
        return self.responseForAsset(request, asset: asset)
    }
  }

  private func addNotFoundHandler() {
    localServer.addDefaultHandlerForMethod("GET", requestClass: GCDWebServerRequest.self) { (request) -> GCDWebServerResponse! in
           return GCDWebServerResponse(statusCode: GCDWebServerClientErrorHTTPStatusCode.HTTPStatusCode_NotFound.rawValue)
    }
  }

  private func responseForAsset(request: GCDWebServerRequest, asset: Asset) -> GCDWebServerResponse {
    let filePath = asset.fileURL.path!
    return responseForFile(request, filePath: filePath, cacheable: asset.cacheable, hash: asset.hash, sourceMapURLPath: asset.sourceMapURLPath)
  }

  private func responseForFile(request: GCDWebServerRequest, filePath: String, cacheable: Bool, hash: String? = nil, sourceMapURLPath: String? = nil) -> GCDWebServerResponse {
    // To protect our server from access by other apps running on the same device,
    // we check whether the rponsequest contains an auth token.
    // The auth token can be passed either as a query item or as a cookie.
    // If the auth token was passed as a query item, we set the cookie.
    var shouldSetCookie = false
    if let query = request.URL.query where query.containsString(authTokenKeyValuePair) {
      shouldSetCookie = true
    } else if let cookie = request.headers["Cookie"] where cookie.containsString(authTokenKeyValuePair) {
    } else {
      return GCDWebServerResponse(statusCode: GCDWebServerClientErrorHTTPStatusCode.HTTPStatusCode_Forbidden.rawValue)
    }

    if !NSFileManager.defaultManager().fileExistsAtPath(filePath) {
      NSLog("File not found: \(filePath)")
      return GCDWebServerResponse(statusCode: GCDWebServerClientErrorHTTPStatusCode.HTTPStatusCode_NotFound.rawValue)
    }

    // Support partial requests using byte ranges
    let response = GCDWebServerFileResponse(file: filePath, byteRange: request.byteRange)
    response.setValue("bytes", forAdditionalHeader: "Accept-Ranges")

    if shouldSetCookie {
      response.setValue(authTokenKeyValuePair, forAdditionalHeader: "Set-Cookie")
    }

    // Only cache files when the file is cacheable and the request URL includes a cache buster
    let shouldCache = cacheable &&
      (!(request.URL.query?.isEmpty ?? true)
        || sha1HashRegEx.matches(request.URL.path!))
    response.cacheControlMaxAge = UInt(shouldCache ? oneYearInSeconds : 0)

    // If we don't set an ETag ourselves, GCDWebServerFileResponse will generate
    // one based on the inode of the file
    if let hash = hash {
      response.eTag = hash
    }

    // GCDWebServerFileResponse sets this to the file modification date, which
    // isn't very useful for our purposes and would hamper
    // the ability to serve conditional requests
    response.lastModifiedDate = nil

    // If the asset has a source map, set the X-SourceMap header
    if let sourceMapURLPath = sourceMapURLPath,
        let sourceMapURL = NSURL(string: sourceMapURLPath, relativeToURL: localServer.serverURL) {
      response.setValue(sourceMapURL.absoluteString, forAdditionalHeader: "X-SourceMap")
    }

    return response
  }
}
