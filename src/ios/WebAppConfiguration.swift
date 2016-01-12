final class WebAppConfiguration {
  let userDefaults = NSUserDefaults.standardUserDefaults()
  
  /// The appId as defined in the runtime config
  private(set) var appId: String? {
    didSet {
      if oldValue != nil && appId != oldValue {
        NSLog("appId seems to have changed, new: \(appId), old: \(oldValue)")
      }
    }
  }
  
  /// The rootURL as defined in the runtime config
  private(set) var rootURL: NSURL? {
    didSet {
      if oldValue != nil && rootURL != oldValue {
        NSLog("ROOT_URL seems to have changed, new: \(rootURL), old: \(oldValue)")
      }
    }
  }
  
  /// Update appId and rootURL with the values in the runtime config
  func updateWithRuntimeConfig(runtimeConfig: JSONObject) {
    appId = runtimeConfig["appId"] as? String
    if let rootURLString = runtimeConfig["ROOT_URL"] as? String {
      rootURL = NSURL(string: rootURLString)
    } else {
      rootURL = nil
    }
  }
  
  /// The last downloaded version of the asset bundle
  var lastDownloadedVersion: String? {
    get {
      return userDefaults.stringForKey("MeteorWebAppLastDownloadedVersion")
    }

    set {
      if newValue != lastDownloadedVersion {
        if newValue == nil {
          userDefaults.removeObjectForKey("MeteorWebAppLastDownloadedVersion")
        } else {
          userDefaults.setObject(newValue, forKey: "MeteorWebAppLastDownloadedVersion")
        }
        userDefaults.synchronize()
      }
    }
  }

  /// The last seen initial version of the asset bundle
  var lastSeenInitialVersion: String? {
    get {
      return userDefaults.stringForKey("MeteorWebAppLastSeenInitialVersion")
    }

    set {
      if newValue != lastDownloadedVersion {
        if newValue == nil {
          userDefaults.removeObjectForKey("MeteorWebAppLastSeenInitialVersion")
        } else {
          userDefaults.setObject(newValue, forKey: "MeteorWebAppLastSeenInitialVersion")
        }
        userDefaults.synchronize()
      }
    }
  }

  /// The last kwown good version of the asset bundle
  var lastKnownGoodVersion: String? {
    get {
      return userDefaults.stringForKey("MeteorWebAppLastKnownGoodVersion")
    }

    set {
      if newValue != lastKnownGoodVersion {
        let userDefaults = NSUserDefaults.standardUserDefaults()
        if newValue == nil {
          userDefaults.removeObjectForKey("MeteorWebAppLastKnownGoodVersion")
        } else {
          userDefaults.setObject(newValue, forKey: "MeteorWebAppLastKnownGoodVersion")
        }
        userDefaults.synchronize()
      }
    }
  }

  /// Blacklisted asset bundle versions
  var blacklistedVersions: [String] {
    get {
      return userDefaults.arrayForKey("MeteorWebAppBlacklistedVersions") as? [String] ?? []
    }

    set {
      if newValue != blacklistedVersions {
        if newValue.isEmpty {
          userDefaults.removeObjectForKey("MeteorWebAppBlacklistedVersions")
        } else {
          userDefaults.setObject(newValue, forKey: "MeteorWebAppBlacklistedVersions")
        }
        userDefaults.synchronize()
      }
    }
  }
  
  func addBlacklistedVersion(version: String) {
    var blacklistedVersions = self.blacklistedVersions
    blacklistedVersions.append(version)
    self.blacklistedVersions = blacklistedVersions
  }
  
  func reset() {
    lastDownloadedVersion = nil
    lastKnownGoodVersion = nil
    blacklistedVersions = []
  }
}
