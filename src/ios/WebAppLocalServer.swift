import WebKit

let oneYearInSeconds = 60 * 60 * 24 * 365

let GCDWebServerRequestAttribute_Asset = "GCDWebServerRequestAttribute_Asset"
let GCDWebServerRequestAttribute_FilePath = "GCDWebServerRequestAttribute_FilePath"

let localFileSystemPath = "/local-filesystem"

@objc(METWebAppLocalServer)
open class WebAppLocalServer: METPlugin, AssetBundleManagerDelegate {
  /// The local web server responsible for serving assets to the web app
  private(set) var localServer: GCDWebServer!

  /// The listening port of the local web server
  private var localServerPort: UInt = 0

  let authTokenKeyValuePair: String = {
    let authToken = ProcessInfo.processInfo.globallyUniqueString
    return "cdvToken=\(authToken)"
  }()

  /// The www directory in the app bundle
  private(set) var wwwDirectoryURL: URL!

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
  private var startupTimeoutInterval: TimeInterval = 20.0

  private var isTesting: Bool = false

  // MARK: - Lifecycle

  /// Called by Cordova on plugin initialization
  override open func pluginInitialize() {
    super.pluginInitialize()

    // Detect whether we are testing the app using
    // cordova-plugin-test-framework
    if let viewController = self.viewController as? CDVViewController,
      viewController.startPage == "cdvtests/index.html" {
        isTesting = true
    }

    configuration = WebAppConfiguration()

    wwwDirectoryURL = Bundle.main.resourceURL!.appendingPathComponent("www")

    initializeAssetBundles()

    // The WebAppLocalServerPort setting is currently only used for testing
    if let portString = (commandDelegate?.settings["WebAppLocalServerPort".lowercased()] as? String),
       let localServerPort = UInt(portString) {
      self.localServerPort = localServerPort
    // In all other cases, we use a listening port that has been set during build
    // and that is determined based on the appId. Hopefully this will avoid
    // collisions between Meteor apps installed on the same device
    } else if let viewController = self.viewController as? CDVViewController,
        let port = URLComponents(string: viewController.startPage)?.port {
      localServerPort = UInt(port)
    }

    do {
      try startLocalServer()
    } catch {
      NSLog("Could not start local server: \(error)")
      return
    }

    if let startupTimeoutString = (commandDelegate?.settings["WebAppStartupTimeout".lowercased()] as? String),
       let startupTimeoutMilliseconds = UInt(startupTimeoutString) {
      startupTimeoutInterval =  TimeInterval(startupTimeoutMilliseconds / 1000)
    }

    if !isTesting {
      startupTimer = METTimer(queue: DispatchQueue.global(qos: .utility)) { [weak self] in
        NSLog("App startup timed out, reverting to last known good version")
        self?.revertToLastKnownGoodVersion()
      }
    }
    
    NotificationCenter.default.addObserver(self, selector: #selector(WebAppLocalServer.pageDidLoad), name: NSNotification.Name.CDVPageDidLoad, object: webView)

    NotificationCenter.default.addObserver(self, selector: #selector(WebAppLocalServer.applicationDidEnterBackground), name: NSNotification.Name.UIApplicationDidEnterBackground, object: nil)
  }

  func initializeAssetBundles() {
    assetBundleManager = nil;

    // The initial asset bundle consists of the assets bundled with the app
    let initialAssetBundle: AssetBundle
    do {
      let directoryURL = wwwDirectoryURL.appendingPathComponent("application")
      initialAssetBundle = try AssetBundle(directoryURL: directoryURL)
    } catch {
      NSLog("Could not load initial asset bundle: \(error)")
      return
    }

    let fileManager = FileManager.default

    // Downloaded versions are stored in Library/NoCloud/meteor
    let libraryDirectoryURL = FileManager.default.urls(for: .libraryDirectory, in: .userDomainMask).first!
    let versionsDirectoryURL = libraryDirectoryURL.appendingPathComponent("NoCloud/meteor")

    // If the last seen initial version is different from the currently bundled
    // version, we delete the versions directory and unset lastDownloadedVersion
    // and blacklistedVersions
    if configuration.lastSeenInitialVersion != initialAssetBundle.version {
      do {
        if fileManager.fileExists(atPath: versionsDirectoryURL.path) {
          try fileManager.removeItem(at: versionsDirectoryURL)
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
      if !fileManager.fileExists(atPath: versionsDirectoryURL.path) {
        try fileManager.createDirectory(at: versionsDirectoryURL, withIntermediateDirectories: true, attributes: nil)
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
  override open func onReset() {
    super.onReset()

    // Clear existing callbacks
    newVersionReadyCallbackId = nil
    errorCallbackId = nil

    // If there is a pending asset bundle, we make it the current
    if let pendingAssetBundle = pendingAssetBundle {
      currentAssetBundle = pendingAssetBundle
      self.pendingAssetBundle = nil
    }

    // Don't start the startup timer if the app started up in the background
    if UIApplication.shared.applicationState == UIApplicationState.active {
      startupTimer?.start(withTimeInterval: startupTimeoutInterval)
    }
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

  open func startupDidComplete(_ command: CDVInvokedUrlCommand) {
    startupTimer?.stop()

    // If startup completed successfully, we consider a version good
    configuration.lastKnownGoodVersion = currentAssetBundle.version

    commandDelegate?.run() {
      do {
        try self.assetBundleManager.removeAllDownloadedAssetBundlesExceptFor(self.currentAssetBundle)
      } catch {
        NSLog("Could not remove unused asset bundles: \(error)")
      }
    }

    let result = CDVPluginResult(status: CDVCommandStatus_OK)
    self.commandDelegate?.send(result, callbackId: command.callbackId)
  }

  open func checkForUpdates(_ command: CDVInvokedUrlCommand) {
    guard let rootURL = configuration.rootURL else {
      let errorMessage = "checkForUpdates requires a rootURL to be configured"
      let result = CDVPluginResult(status: CDVCommandStatus_ERROR, messageAs: errorMessage)
      commandDelegate?.send(result, callbackId: command.callbackId)
      return
    }

    let baseURL = rootURL.appendingPathComponent("__cordova/")
    assetBundleManager.checkForUpdatesWithBaseURL(baseURL)

    let result = CDVPluginResult(status: CDVCommandStatus_OK)
    commandDelegate?.send(result, callbackId: command.callbackId)
  }

  open func onNewVersionReady(_ command: CDVInvokedUrlCommand) {
    newVersionReadyCallbackId = command.callbackId

    let result = CDVPluginResult(status: CDVCommandStatus_NO_RESULT)
    // This allows us to invoke the callback later
    result?.setKeepCallbackAs(true)
    commandDelegate?.send(result, callbackId: newVersionReadyCallbackId)
  }

  private func notifyNewVersionReady(_ version: String?) {
    guard let newVersionReadyCallbackId = newVersionReadyCallbackId else { return }

    let result = CDVPluginResult(status: CDVCommandStatus_OK, messageAs: version)
    // This allows us to invoke the callback later
    result?.setKeepCallbackAs(true)
    commandDelegate?.send(result, callbackId: newVersionReadyCallbackId)
  }

  open func onError(_ command: CDVInvokedUrlCommand) {
    errorCallbackId = command.callbackId

    let result = CDVPluginResult(status: CDVCommandStatus_NO_RESULT)
    // This allows us to invoke the callback later
    result?.setKeepCallbackAs(true)
    commandDelegate?.send(result, callbackId: errorCallbackId)
  }

  private func notifyError(_ error: Error) {
    NSLog("Download failure: \(error)")

    guard let errorCallbackId = errorCallbackId else { return }

    let errorMessage = String(describing: error)
    let result = CDVPluginResult(status: CDVCommandStatus_OK, messageAs: errorMessage)
    // This allows us to invoke the callback later
    result?.setKeepCallbackAs(true)
    commandDelegate?.send(result, callbackId: errorCallbackId)
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

  func assetBundleManager(_ assetBundleManager: AssetBundleManager, shouldDownloadBundleForManifest manifest: AssetManifest) -> Bool {
    // No need to redownload the current or the pending version
    if currentAssetBundle.version == manifest.version || pendingAssetBundle?.version == manifest.version {
      return false
    }

    // Don't download blacklisted versions
    if configuration.blacklistedVersions.contains(manifest.version) {
      notifyError(WebAppError.unsuitableAssetBundle(reason: "Skipping downloading blacklisted version", underlyingError: nil))
      return false
    }
    
    // Don't download versions potentially incompatible with the bundled native code
    if manifest.cordovaCompatibilityVersion != configuration.cordovaCompatibilityVersion {
      notifyError(WebAppError.unsuitableAssetBundle(reason: "Skipping downloading new version because the Cordova platform version or plugin versions have changed and are potentially incompatible", underlyingError: nil))
      return false
    }

    return true
  }

  func assetBundleManager(_ assetBundleManager: AssetBundleManager, didFinishDownloadingBundle assetBundle: AssetBundle) {
    NSLog("Finished downloading new asset bundle version: \(assetBundle.version)")

    configuration.lastDownloadedVersion = assetBundle.version
    pendingAssetBundle = assetBundle
    notifyNewVersionReady(assetBundle.version)
  }

  func assetBundleManager(_ assetBundleManager: AssetBundleManager, didFailDownloadingBundleWithError error: Error) {
    notifyError(error)
  }

  // MARK: - Local server

  func startLocalServer() throws {
    localServer = GCDWebServer()
    // setLogLevel for some reason expects an int instead of an enum
    GCDWebServer.setLogLevel(GCDWebServerLoggingLevel.info.rawValue)

    // Handlers are added last to first
    addNotFoundHandler()
    addIndexFileHandler()
    addHandlerForLocalFileSystem()
    addHandlerForWwwDirectory()
    addHandlerForAssetBundle()

    let options = [
      GCDWebServerOption_Port: NSNumber(value: localServerPort as UInt),
      GCDWebServerOption_BindToLocalhost: true,
      GCDWebServerOption_AutomaticallySuspendInBackground: false]
    try localServer.start(options: options)

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
    localServer.addHandler(match: { [weak self] (requestMethod, requestURL, requestHeaders, urlPath, urlQuery) -> GCDWebServerRequest! in
      if requestMethod != "GET" { return nil }
      guard let urlPath = urlPath else { return nil }
      guard let asset = self?.currentAssetBundle?.assetForURLPath(urlPath) else { return nil }

      let request = GCDWebServerRequest(method: requestMethod, url: requestURL, headers: requestHeaders, path: urlPath, query: urlQuery)!
      request.setAttribute(asset, forKey: GCDWebServerRequestAttribute_Asset)
      return request
    }) { (request) -> GCDWebServerResponse! in
        let asset = request?.attribute(forKey: GCDWebServerRequestAttribute_Asset) as! Asset
        return self.responseForAsset(request!, asset: asset)
    }
  }

  private func addHandlerForWwwDirectory() {
    localServer.addHandler(match: { [weak self] (requestMethod, requestURL, requestHeaders, urlPath, urlQuery) -> GCDWebServerRequest! in
      if requestMethod != "GET" { return nil }
      guard let urlPath = urlPath else { return nil }

      // Do not serve files from /application, because these should only be served through the initial asset bundle
      if (urlPath.hasPrefix("/application")) { return nil }

      guard let fileURL = self?.wwwDirectoryURL?.appendingPathComponent(urlPath) else { return nil }
      if fileURL.isRegularFile != true { return nil }

      let request = GCDWebServerRequest(method: requestMethod, url: requestURL, headers: requestHeaders, path: urlPath, query: urlQuery)
      request?.setAttribute(fileURL.path, forKey: GCDWebServerRequestAttribute_FilePath)
      return request
    }) { (request) -> GCDWebServerResponse! in
      let filePath = request?.attribute(forKey: GCDWebServerRequestAttribute_FilePath) as! String
      return self.responseForFile(request!, filePath: filePath, cacheable: false)
    }
  }

  private func addHandlerForLocalFileSystem() {
    localServer.addHandler(match: { (requestMethod, requestURL, requestHeaders, urlPath, urlQuery) -> GCDWebServerRequest! in
      if requestMethod != "GET" { return nil }
      guard let urlPath = urlPath else { return nil }

      if !(urlPath.hasPrefix(localFileSystemPath)) { return nil }

      let filePath = urlPath.substring(from: localFileSystemPath.endIndex)
      let fileURL = URL(fileURLWithPath: filePath)
      if fileURL.isRegularFile != true { return nil }

      let request = GCDWebServerRequest(method: requestMethod, url: requestURL, headers: requestHeaders, path: urlPath, query: urlQuery)
      request?.setAttribute(filePath, forKey: GCDWebServerRequestAttribute_FilePath)
      return request
      }) { (request) -> GCDWebServerResponse! in
        let filePath = request?.attribute(forKey: GCDWebServerRequestAttribute_FilePath) as! String
        return self.responseForFile(request!, filePath: filePath, cacheable: false)
    }
  }

  private func addIndexFileHandler() {
    localServer.addHandler(match: { [weak self] (requestMethod, requestURL, requestHeaders, urlPath, urlQuery) -> GCDWebServerRequest! in
      if requestMethod != "GET" { return nil }
      guard let urlPath = urlPath else { return nil }

      // Don't serve index.html for local file system paths
      if (urlPath.hasPrefix(localFileSystemPath)) { return nil }

      if urlPath == "/favicon.ico" { return nil }

      guard let indexFile = self?.currentAssetBundle?.indexFile else { return nil }

      let request = GCDWebServerRequest(method: requestMethod, url: requestURL, headers: requestHeaders, path: urlPath, query: urlQuery)
      request?.setAttribute(indexFile, forKey: GCDWebServerRequestAttribute_Asset)
      return request
      }) { (request) -> GCDWebServerResponse! in
        let asset = request?.attribute(forKey: GCDWebServerRequestAttribute_Asset) as! Asset
        return self.responseForAsset(request!, asset: asset)
    }
  }

  private func addNotFoundHandler() {
    localServer.addDefaultHandler(forMethod: "GET", request: GCDWebServerRequest.self) { (request) -> GCDWebServerResponse! in
      return GCDWebServerResponse(statusCode: GCDWebServerClientErrorHTTPStatusCode.httpStatusCode_NotFound.rawValue)
    }
  }

  private func responseForAsset(_ request: GCDWebServerRequest, asset: Asset) -> GCDWebServerResponse {
    let filePath = asset.fileURL.path
    return responseForFile(request, filePath: filePath, cacheable: asset.cacheable, hash: asset.hash, sourceMapURLPath: asset.sourceMapURLPath)
  }

  private func responseForFile(_ request: GCDWebServerRequest, filePath: String, cacheable: Bool, hash: String? = nil, sourceMapURLPath: String? = nil) -> GCDWebServerResponse {
    // To protect our server from access by other apps running on the same device,
    // we check whether the rponsequest contains an auth token.
    // The auth token can be passed either as a query item or as a cookie.
    // If the auth token was passed as a query item, we set the cookie.
    var shouldSetCookie = false
    if let query = request.url.query, query.contains(authTokenKeyValuePair) {
      shouldSetCookie = true
    } else if let cookie = request.headers["Cookie"], (cookie as AnyObject).contains(authTokenKeyValuePair) {
    } else {
      return GCDWebServerResponse(statusCode: GCDWebServerClientErrorHTTPStatusCode.httpStatusCode_Forbidden.rawValue)
    }

    if !FileManager.default.fileExists(atPath: filePath) {
      NSLog("File not found: \(filePath)")
      return GCDWebServerResponse(statusCode: GCDWebServerClientErrorHTTPStatusCode.httpStatusCode_NotFound.rawValue)
    }

    // Support partial requests using byte ranges
    guard let response = GCDWebServerFileResponse(file: filePath, byteRange: request.byteRange) else {
      return GCDWebServerResponse(statusCode: GCDWebServerClientErrorHTTPStatusCode.httpStatusCode_NotFound.rawValue)
    }
    
    response.setValue("bytes", forAdditionalHeader: "Accept-Ranges")

    if shouldSetCookie {
      response.setValue(authTokenKeyValuePair, forAdditionalHeader: "Set-Cookie")
    }

    // Only cache files when the file is cacheable and the request URL includes a cache buster
    let shouldCache = cacheable &&
      (!(request.url.query?.isEmpty ?? true)
        || sha1HashRegEx.matches(request.url.path))
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
        let sourceMapURL = URL(string: sourceMapURLPath, relativeTo: localServer.serverURL) {
      response.setValue(sourceMapURL.absoluteString, forAdditionalHeader: "X-SourceMap")
    }

    return response
  }
}
