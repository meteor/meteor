extension WebAppLocalServer {
  func simulatePageReload(_ command: CDVInvokedUrlCommand) {
    onReset()

    let result = CDVPluginResult(status: CDVCommandStatus_OK)
    commandDelegate?.send(result, callbackId:command.callbackId)
  }

  func simulateAppRestart(_ command: CDVInvokedUrlCommand) {
    initializeAssetBundles()
    onReset()

    let result = CDVPluginResult(status: CDVCommandStatus_OK)
    commandDelegate?.send(result, callbackId:command.callbackId)
  }

  func resetToInitialState(_ command: CDVInvokedUrlCommand) {
    commandDelegate?.run() {
      self.configuration.reset()
      self.initializeAssetBundles()
      self.onReset()

      let result = CDVPluginResult(status: CDVCommandStatus_OK)
      self.commandDelegate?.send(result, callbackId:command.callbackId)
    }
  }

  func getAuthTokenKeyValuePair(_ command: CDVInvokedUrlCommand) {
    let result = CDVPluginResult(status: CDVCommandStatus_OK, messageAs: authTokenKeyValuePair)
    commandDelegate?.send(result, callbackId:command.callbackId)
  }

  func downloadedVersionExists(_ command: CDVInvokedUrlCommand) {
    guard let version = command.argument(at: 0) as? String else {
      let errorMessage = "'version' argument required"
      let result = CDVPluginResult(status: CDVCommandStatus_ERROR, messageAs: errorMessage)
      commandDelegate?.send(result, callbackId: command.callbackId)
      return
    }

    let versionExists = assetBundleManager.downloadedAssetBundleWithVersion(version) != nil

    let result = CDVPluginResult(status: CDVCommandStatus_OK, messageAs: versionExists)
    commandDelegate?.send(result, callbackId:command.callbackId)
  }

  func simulatePartialDownload(_ command: CDVInvokedUrlCommand) {
    guard let version = command.argument(at: 0) as? String else {
      let errorMessage = "'version' argument required"
      let result = CDVPluginResult(status: CDVCommandStatus_ERROR, messageAs: errorMessage)
      commandDelegate?.send(result, callbackId: command.callbackId)
      return
    }

    commandDelegate?.run() {
      let wwwDirectoryURL = Bundle.main.resourceURL!.appendingPathComponent("www")
      let versionDirectoryURL = wwwDirectoryURL.appendingPathComponent("partially_downloaded_versions/\(version)")

      let versionsDirectoryURL = self.assetBundleManager.versionsDirectoryURL
      let downloadDirectoryURL = versionsDirectoryURL.appendingPathComponent("Downloading")

      let fileManager = FileManager.default

      if fileManager.fileExists(atPath: downloadDirectoryURL.path) {
        try! fileManager.removeItem(at: downloadDirectoryURL)
      }

      try! fileManager.copyItem(at: versionDirectoryURL, to: downloadDirectoryURL)

      let result = CDVPluginResult(status: CDVCommandStatus_OK)
      self.commandDelegate?.send(result, callbackId:command.callbackId)
    };
  }
}
