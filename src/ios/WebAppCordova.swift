import WebKit

let oneYearInSeconds = 60 * 60 * 24 * 365

let GCDWebServerRequestAttribute_Asset = "GCDWebServerRequestAttribute_Asset"
let GCDWebServerRequestAttribute_FilePath = "GCDWebServerRequestAttribute_FilePath"

// The range of listening ports to choose from. It should be large enough to
// avoid collisions with other Meteor apps, but chosen to avoid collisions
// with other apps or services on the device.
// See https://support.apple.com/en-us/HT202944 for some common ports in
// use by Apple services.
let listeningPortRange: Range<UInt> = 12000...13000

let startupTimeoutInterval = 10.0

@objc(METWebAppCordova)
final public class WebAppCordova: CDVPlugin, AssetBundleManagerDelegate {
  /// The local web server responsible for serving assets to the web app
  private(set) var localServer: GCDWebServer!
  private var localServerPort: UInt = 0

  /// The www directory in the app bundle
  private(set) var wwwDirectoryURL: NSURL!

  /// The asset bundle manager is responsible for downloading and managing
  /// asset bundles
  var assetBundleManager: AssetBundleManager!

  /// The asset bundle currently used to serve assets from
  var currentAssetBundle: AssetBundle! {
    didSet {
      if currentAssetBundle != nil {
        runtimeConfig = currentAssetBundle.runtimeConfig

        if let version = currentAssetBundle.version {
          NSLog("Serving asset bundle version: \(version)")
        } else {
          NSLog("Serving initial asset bundle")
        }
      } else {
        runtimeConfig = nil
      }
    }
  }

  /// Setting the runtime config initializes autoupdateVersion and rootURL
  private var runtimeConfig: JSONObject? {
    didSet {
      appId = runtimeConfig?["appId"] as? String
      autoupdateVersion = runtimeConfig?["autoupdateVersionCordova"] as? String
      if let rootURLString = runtimeConfig?["ROOT_URL"] as? String {
        rootURL = NSURL(string: rootURLString)
      } else {
        rootURL = nil
      }
    }
  }

  /// The appId as defined in the runtime config
  private(set) var appId: String?

  /// The autoupdate version as defined in the runtime config
  private(set) var autoupdateVersion: String?

  /// The rootURL as defined in the runtime config
  private(set) var rootURL: NSURL? {
    didSet {
      if oldValue != nil && rootURL != oldValue {
        NSLog("ROOT_URL seems to have changed, new: \(rootURL), old: \(oldValue)")
      }
    }
  }

  /// Downloaded asset bundles are considered pending until the next page reload
  /// because we don't want the app to end up in an inconsistent state by
  /// loading assets from different bundles.
  private var pendingAssetBundle: AssetBundle?

  /// The last downloaded version of the asset bundle, stored in `NSUserDefaults`
  var lastDownloadedVersion: String? {
    get {
      return NSUserDefaults.standardUserDefaults().stringForKey("MeteorWebAppLastDownloadedVersion")
    }

    set {
      if newValue != lastDownloadedVersion {
        let userDefaults = NSUserDefaults.standardUserDefaults()
        userDefaults.setObject(newValue, forKey: "MeteorWebAppLastDownloadedVersion")
        userDefaults.synchronize()
      }
    }
  }

  /// The last seen initial version of the asset bundle, stored in `NSUserDefaults`
  var lastSeenInitialVersion: String? {
    get {
      return NSUserDefaults.standardUserDefaults().stringForKey("MeteorWebAppLastSeenInitialVersion")
    }

    set {
      if newValue != lastDownloadedVersion {
        let userDefaults = NSUserDefaults.standardUserDefaults()
        userDefaults.setObject(newValue, forKey: "MeteorWebAppLastSeenInitialVersion")
        userDefaults.synchronize()
      }
    }
  }

  /// Blacklisted asset bundle versions, stored in `NSUserDefaults`
  var blacklistedVersions: [String] {
    get {
      return NSUserDefaults.standardUserDefaults().arrayForKey("MeteorWebAppBlacklistedVersions") as? [String] ?? []
    }

    set {
      if newValue != blacklistedVersions {
        let userDefaults = NSUserDefaults.standardUserDefaults()
        if newValue.isEmpty {
          userDefaults.removeObjectForKey("MeteorWebAppBlacklistedVersions")
        } else {
          userDefaults.setObject(newValue, forKey: "MeteorWebAppBlacklistedVersions")
        }
        userDefaults.synchronize()
      }
    }
  }

  /// Callback ID used to send a newVersionDownloaded notification to JavaScript
  private var newVersionDownloadedCallbackId: String?

  /// Callback ID used to send a downloadFailure notification to JavaScript
  private var downloadFailureCallbackId: String?

  private var startupTimer: METTimer!

  // MARK: - Lifecycle

  /// Called by Cordova on plugin initialization
  override public func pluginInitialize() {
    super.pluginInitialize()
    
    NSNotificationCenter.defaultCenter().addObserver(self, selector: "applicationDidEnterBackground", name: UIApplicationDidEnterBackgroundNotification, object: nil)

    NSNotificationCenter.defaultCenter().addObserver(self, selector: "pageDidLoad", name: CDVPageDidLoadNotification, object: webView)

    wwwDirectoryURL = NSBundle.mainBundle().resourceURL!.URLByAppendingPathComponent("www")

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
    if lastSeenInitialVersion != initialAssetBundle.version {
      do {
        if fileManager.fileExistsAtPath(versionsDirectoryURL.path!) {
          try fileManager.removeItemAtURL(versionsDirectoryURL)
        }
      } catch {
        NSLog("Could not remove versions directory: \(error)")
      }

      lastDownloadedVersion = nil
      blacklistedVersions = []
    }

    do {
      if !fileManager.fileExistsAtPath(versionsDirectoryURL.path!) {
        try fileManager.createDirectoryAtURL(versionsDirectoryURL, withIntermediateDirectories: true, attributes: nil)
      }
    } catch {
      NSLog("Could not create versions directory: \(error)")
    }

    assetBundleManager = AssetBundleManager(versionsDirectoryURL: versionsDirectoryURL, initialAssetBundle: initialAssetBundle)
    assetBundleManager.delegate = self

    // If a last downloaded version has been set and the asset bundle exists,
    // we set it as the current asset bundle
    if let lastDownloadedVersion = lastDownloadedVersion,
        let downloadedAssetBundle = assetBundleManager.downloadedAssetBundleWithVersion(lastDownloadedVersion) {
      currentAssetBundle = downloadedAssetBundle
    } else {
      currentAssetBundle = initialAssetBundle
    }

    lastSeenInitialVersion = initialAssetBundle.version

    // The WebAppLocalServerPort setting is only used for testing
    if let portString = (commandDelegate?.settings["WebAppLocalServerPort".lowercaseString] as? String) {
      localServerPort = UInt(portString) ?? 0
    // In other cases, we select a listening port based on the appId to try and
    // avoid collisions between Meteor apps installed on the same device
    } else {
      let hashValue = appId?.hashValue ?? 0
      localServerPort = listeningPortRange.startIndex +
        (UInt(bitPattern: hashValue) % UInt(listeningPortRange.count))
    }

    do {
      try startLocalServer()
    } catch {
      NSLog("Could not start local server: \(error)")
      return
    }
    
    startupTimer = METTimer(queue: dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0)) {
      NSLog("Startup timed out")
      self.revertToLastKnownGoodVersion()
    }
  }

  /// Called by Cordova before page reload
  override public func onReset() {
    super.onReset()

    // If there is a pending asset bundle, we make it the current
    if let pendingAssetBundle = pendingAssetBundle {
      currentAssetBundle = pendingAssetBundle
      self.pendingAssetBundle = nil
    }

    startupTimer.startWithTimeInterval(startupTimeoutInterval)
  }
  
  // MARK: - Notifications

  func pageDidLoad() {
    NSLog("pageDidLoad")
  }
  
  func applicationDidEnterBackground() {
    NSLog("applicationDidEnterBackground")
    
    // Stop startup timer when going into the background, to avoid
    // blacklisting a version just because the web view has been suspended
    startupTimer.stop()
  }

  // MARK: - Public plugin commands

  public func startupDidComplete(command: CDVInvokedUrlCommand) {
    NSLog("startupDidComplete")
    
    startupTimer.stop()

    commandDelegate?.runInBackground() {
      do {
        let currentVersion = self.currentAssetBundle.version
        try self.assetBundleManager.removeAllAssetBundlesExceptForCurrentVersion(currentVersion)
      } catch {
        let errorMessage = "Could not remove unused asset bundles: \(error)"
        let result = CDVPluginResult(status: CDVCommandStatus_ERROR, messageAsString: errorMessage)
        self.commandDelegate?.sendPluginResult(result, callbackId: command.callbackId)
        return
      }

      let result = CDVPluginResult(status: CDVCommandStatus_OK)
      self.commandDelegate?.sendPluginResult(result, callbackId: command.callbackId)
    }
  }

  public func checkForUpdates(command: CDVInvokedUrlCommand) {
    guard let rootURL = rootURL else {
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

  public func onNewVersionDownloaded(command: CDVInvokedUrlCommand) {
    newVersionDownloadedCallbackId = command.callbackId

    let result = CDVPluginResult(status: CDVCommandStatus_NO_RESULT)
    // This allows us to invoke the callback later
    result.setKeepCallbackAsBool(true)
    commandDelegate?.sendPluginResult(result, callbackId: newVersionDownloadedCallbackId)
  }

  private func notifyNewVersionDownloaded(version: String?) {
    let result = CDVPluginResult(status: CDVCommandStatus_OK, messageAsString: version)
    commandDelegate?.sendPluginResult(result, callbackId: newVersionDownloadedCallbackId)
  }

  public func onDownloadFailure(command: CDVInvokedUrlCommand) {
    downloadFailureCallbackId = command.callbackId

    let result = CDVPluginResult(status: CDVCommandStatus_NO_RESULT)
    // This allows us to invoke the callback later
    result.setKeepCallbackAsBool(true)
    commandDelegate?.sendPluginResult(result, callbackId: downloadFailureCallbackId)
  }

  private func notifyDownloadFailure(error: ErrorType) {
    let errorMessage = String(error)
    let result = CDVPluginResult(status: CDVCommandStatus_OK, messageAsString: errorMessage)
    commandDelegate?.sendPluginResult(result, callbackId: downloadFailureCallbackId)
  }
  
  // MARK: - Managing Versions
  
  func revertToLastKnownGoodVersion() {
    if let currentVersion = currentAssetBundle.version {
      var blacklistedVersions = self.blacklistedVersions
      blacklistedVersions.append(currentVersion)
      self.blacklistedVersions = blacklistedVersions
    }
    
    pendingAssetBundle = assetBundleManager.initialAssetBundle
    
    forceReload()
  }
  
  func forceReload() {
    if let webView = self.webView as? WKWebView {
      webView.reloadFromOrigin()
    }
  }

  // MARK: AssetBundleManagerDelegate

  func assetBundleManager(assetBundleManager: AssetBundleManager, didFinishDownloadingBundle assetBundle: AssetBundle) {
    NSLog("Finished downloading new asset bundle version: \(assetBundle.version!)")
    lastDownloadedVersion = assetBundle.version
    pendingAssetBundle = assetBundle
    notifyNewVersionDownloaded(assetBundle.version)
  }

  func assetBundleManager(assetBundleManager: AssetBundleManager, didFailDownloadingBundleWithError error: ErrorType) {
    NSLog("Failed downloading new asset bundle version: \(error)")
    notifyDownloadFailure(error)
  }

  func assetBundleManager(assetBundleManager: AssetBundleManager, shouldDownloadBundleForManifest manifest: AssetManifest) -> Bool {
    // No need to redownload the current version
    if currentAssetBundle.version == manifest.version {
      return false
    }

    // Don't download blacklisted versions
    if blacklistedVersions.contains(manifest.version!) {
      return false
    }

    return true
  }

  // MARK: - Local server

  func startLocalServer() throws {
    localServer = GCDWebServer()
    // setLogLevel for some reason expects an int instead of an enum
    GCDWebServer.setLogLevel(GCDWebServerLoggingLevel.Info.rawValue)

    // Handlers are added last to first
    addDefaultHandler()
    addHandlerForWwwDirectory()
    addHandlerForAssetBundle()

    let options = [
      GCDWebServerOption_Port: NSNumber(unsignedInteger: localServerPort),
      GCDWebServerOption_BindToLocalhost: true]
    try localServer.startWithOptions(options)

    // Set localServerPort to the assigned port, in case it is different
    localServerPort = localServer.port

    if let viewController = self.viewController as? CDVViewController {
      // Do not modify startPage if we are testing the app using
      // cordova-plugin-test-framework
      if viewController.startPage != "cdvtests/index.html" {
        viewController.startPage = "http://localhost:\(localServerPort)"
      }
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

  private func addDefaultHandler() {
    localServer.addDefaultHandlerForMethod("GET", requestClass: GCDWebServerRequest.self) { [weak self] (request) -> GCDWebServerResponse! in
      guard let indexFile = self?.currentAssetBundle?.indexFile else {
        return GCDWebServerResponse(statusCode: GCDWebServerClientErrorHTTPStatusCode.HTTPStatusCode_NotFound.rawValue)
      }
      return self?.responseForAsset(request, asset: indexFile)
    }
  }

  private func responseForAsset(request: GCDWebServerRequest, asset: Asset) -> GCDWebServerResponse {
    let filePath = asset.fileURL.path!
    return responseForFile(request, filePath: filePath, cacheable: asset.cacheable, hash: asset.hash, sourceMapURLPath: asset.sourceMapURLPath)
  }

  private func responseForFile(request: GCDWebServerRequest, filePath: String, cacheable: Bool, hash: String? = nil, sourceMapURLPath: String? = nil) -> GCDWebServerResponse {
    if !NSFileManager.defaultManager().fileExistsAtPath(filePath) {
      NSLog("File not found: \(filePath)")
      return GCDWebServerResponse(statusCode: GCDWebServerClientErrorHTTPStatusCode.HTTPStatusCode_NotFound.rawValue)
    }

    // Support partial requests using byte ranges
    let response = GCDWebServerFileResponse(file: filePath, byteRange: request.byteRange)
    response.setValue("bytes", forAdditionalHeader: "Accept-Ranges")

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
