extension WebApp {
  func resetToInitialState(command: CDVInvokedUrlCommand) {
    commandDelegate?.runInBackground() {
      self.removeUserDefaults()
      self.initializeAssetBundles()

      let result = CDVPluginResult(status: CDVCommandStatus_OK)
      self.commandDelegate?.sendPluginResult(result, callbackId:command.callbackId)
    }
  }

  private func removeUserDefaults() {
    let userDefaults = NSUserDefaults.standardUserDefaults()
    userDefaults.removeObjectForKey("MeteorWebAppLastSeenInitialVersion")
    userDefaults.removeObjectForKey("MeteorWebAppLastDownloadedVersion")
    userDefaults.synchronize()
  }

  func simulatePageReload(command: CDVInvokedUrlCommand) {
    NSLog("simulatePageReload");
    onReset()

    let result = CDVPluginResult(status: CDVCommandStatus_OK)
    commandDelegate?.sendPluginResult(result, callbackId:command.callbackId)
  }

  func simulateAppRestart(command: CDVInvokedUrlCommand) {
    NSLog("simulateAppRestart");

    initializeAssetBundles()

    let result = CDVPluginResult(status: CDVCommandStatus_OK)
    commandDelegate?.sendPluginResult(result, callbackId:command.callbackId)
  }

  func getAuthTokenKeyValuePair(command: CDVInvokedUrlCommand) {
    NSLog("authTokenKeyValuePair: \(authTokenKeyValuePair)")
    let result = CDVPluginResult(status: CDVCommandStatus_OK, messageAsString: authTokenKeyValuePair)
    commandDelegate?.sendPluginResult(result, callbackId:command.callbackId)
  }

  func downloadedVersionExists(command: CDVInvokedUrlCommand) {
    guard let version = command.argumentAtIndex(0) as? String else {
      let errorMessage = "'version' argument required"
      let result = CDVPluginResult(status: CDVCommandStatus_ERROR, messageAsString: errorMessage)
      commandDelegate?.sendPluginResult(result, callbackId: command.callbackId)
      return
    }

    let versionExists = assetBundleManager.downloadedAssetBundleWithVersion(version) != nil

    let result = CDVPluginResult(status: CDVCommandStatus_OK, messageAsBool: versionExists)
    commandDelegate?.sendPluginResult(result, callbackId:command.callbackId)
  }

  func simulatePartialDownload(command: CDVInvokedUrlCommand) {
    guard let version = command.argumentAtIndex(0) as? String else {
      let errorMessage = "'version' argument required"
      let result = CDVPluginResult(status: CDVCommandStatus_ERROR, messageAsString: errorMessage)
      commandDelegate?.sendPluginResult(result, callbackId: command.callbackId)
      return
    }

    commandDelegate?.runInBackground() {
      let wwwDirectoryURL = NSBundle.mainBundle().resourceURL!.URLByAppendingPathComponent("www")
      let versionDirectoryURL = wwwDirectoryURL.URLByAppendingPathComponent("partially_downloaded_versions/\(version)")

      let versionsDirectoryURL = self.assetBundleManager.versionsDirectoryURL
      let downloadDirectoryURL = versionsDirectoryURL.URLByAppendingPathComponent("Downloading")

      let fileManager = NSFileManager.defaultManager()
      try! fileManager.copyItemAtURL(versionDirectoryURL, toURL: downloadDirectoryURL)

      let result = CDVPluginResult(status: CDVCommandStatus_OK)
      self.commandDelegate?.sendPluginResult(result, callbackId:command.callbackId)
    };
  }
}
