final class WebAppConfiguration {
  let userDefaults = UserDefaults.standard

  /// The appId as defined in the runtime config
  var appId: String? {
    get {
      return userDefaults.string(forKey: "MeteorWebAppId")
    }
    set {
      let oldValue = appId
      if newValue != oldValue && newValue != nil {
        if oldValue != nil {
          NSLog("appId seems to have changed, new: \(newValue!), old: \(oldValue!)")
        }

        userDefaults.set(newValue, forKey: "MeteorWebAppId")
        userDefaults.synchronize()
      }
    }
  }

  /// The rootURL as defined in the runtime config
  var rootURL: URL? {
    get {
      return userDefaults.url(forKey: "MeteorWebAppRootURL")
    }
    set {
      let oldValue = rootURL
      if newValue != oldValue && newValue != nil {
        if oldValue != nil {
          NSLog("ROOT_URL seems to have changed, new: \(newValue!), old: \(oldValue!)")
        }

        userDefaults.set(newValue, forKey: "MeteorWebAppRootURL")
        userDefaults.synchronize()
      }
    }
  }

  /// The Cordova compatibility version as specified in the asset manifest
  var cordovaCompatibilityVersion: String? {
    get {
      return userDefaults.string(forKey: "MeteorWebAppCordovaCompatibilityVersion")
    }

    set {
      if newValue != cordovaCompatibilityVersion {
        if newValue == nil {
          userDefaults.removeObject(forKey: "MeteorWebAppCordovaCompatibilityVersion")
        } else {
          userDefaults.set(newValue, forKey: "MeteorWebAppCordovaCompatibilityVersion")
        }
        userDefaults.synchronize()
      }
    }
  }

  /// The last seen initial version of the asset bundle
  var lastSeenInitialVersion: String? {
    get {
      return userDefaults.string(forKey: "MeteorWebAppLastSeenInitialVersion")
    }

    set {
      if newValue != lastSeenInitialVersion {
        if newValue == nil {
          userDefaults.removeObject(forKey: "MeteorWebAppLastSeenInitialVersion")
        } else {
          userDefaults.set(newValue, forKey: "MeteorWebAppLastSeenInitialVersion")
        }
        userDefaults.synchronize()
      }
    }
  }

  /// The last downloaded version of the asset bundle
  var lastDownloadedVersion: String? {
    get {
      return userDefaults.string(forKey: "MeteorWebAppLastDownloadedVersion")
    }

    set {
      if newValue != lastDownloadedVersion {
        if newValue == nil {
          userDefaults.removeObject(forKey: "MeteorWebAppLastDownloadedVersion")
        } else {
          userDefaults.set(newValue, forKey: "MeteorWebAppLastDownloadedVersion")
        }
        userDefaults.synchronize()
      }
    }
  }

  /// The last kwown good version of the asset bundle
  var lastKnownGoodVersion: String? {
    get {
      return userDefaults.string(forKey: "MeteorWebAppLastKnownGoodVersion")
    }

    set {
      if newValue != lastKnownGoodVersion {
        let userDefaults = UserDefaults.standard
        if newValue == nil {
          userDefaults.removeObject(forKey: "MeteorWebAppLastKnownGoodVersion")
        } else {
          userDefaults.set(newValue, forKey: "MeteorWebAppLastKnownGoodVersion")
        }
        userDefaults.synchronize()
      }
    }
  }

  /// Blacklisted asset bundle versions
  var blacklistedVersions: [String] {
    get {
      let versions = userDefaults.array(forKey: "MeteorWebAppBlacklistedVersions") as? [String] ?? []
      NSLog("BLACKLIST - blacklistedVersions: \(versions)")
      return versions
    }

    set {
      if newValue != blacklistedVersions {
        if newValue.isEmpty {
          NSLog("BLACKLIST - removing blacklisted versions");
          userDefaults.removeObject(forKey: "MeteorWebAppBlacklistedVersions")
        } else {
          userDefaults.set(newValue, forKey: "MeteorWebAppBlacklistedVersions")
        }
        userDefaults.synchronize()
      }
    }
  }

  var versionsToRetry: [String] {
    get {
      let versions = userDefaults.array(forKey: "MeteorWebAppVersionsToRetry") as? [String] ?? []
      NSLog("BLACKLIST - versionsToRetry: \(versions)")
      return versions
    }
    set {
      if newValue != versionsToRetry {
        if newValue.isEmpty {
          NSLog("BLACKLIST - removing versions to retry")
          userDefaults.removeObject(forKey: "MeteorWebAppVersionsToRetry")
        } else {
          userDefaults.set(newValue, forKey: "MeteorWebAppVersionsToRetry")
        }
        userDefaults.synchronize()
      }
    }
  }
    
  func addBlacklistedVersion(_ version: String) {
    var blacklistedVersions = self.blacklistedVersions
    var versionsToRetry = self.versionsToRetry
    
    if (!versionsToRetry.contains(version) && !blacklistedVersions.contains(version)) {
      NSLog("BLACKLIST - adding faulty version to retry: \(version)")
      versionsToRetry.append(version)
      self.versionsToRetry = versionsToRetry
    } else {
      if let i = versionsToRetry.index(of: version) {
        versionsToRetry.remove(at: i)
        self.versionsToRetry = versionsToRetry
      }
      if (!blacklistedVersions.contains(version)) {
        blacklistedVersions.append(version)
        NSLog("BLACKLIST - blacklisting version: \(version)")
        self.blacklistedVersions = blacklistedVersions
      }
    }
  }

  func reset() {
    cordovaCompatibilityVersion = nil
    lastSeenInitialVersion = nil
    lastDownloadedVersion = nil
    lastKnownGoodVersion = nil
    blacklistedVersions = []
    versionsToRetry = []
  }
}
