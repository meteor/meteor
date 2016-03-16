final class WebAppConfiguration {
  let userDefaults = NSUserDefaults.standardUserDefaults()
  
  /// The appId as defined in the runtime config
  var appId: String? {
    get {
      return userDefaults.stringForKey("MeteorWebAppId")
    }
    set {
      let oldValue = appId
      if newValue != oldValue && newValue != nil {
        if oldValue != nil {
          NSLog("appId seems to have changed, new: \(newValue!), old: \(oldValue!)")
        }
        
        userDefaults.setObject(newValue, forKey: "MeteorWebAppId")
        userDefaults.synchronize()
      }
    }
  }
  
  /// The rootURL as defined in the runtime config
  var rootURL: NSURL? {
    get {
      return userDefaults.URLForKey("MeteorWebAppRootURL")
    }
    set {
      let oldValue = rootURL
      if newValue != oldValue && newValue != nil {
        if oldValue != nil {
          NSLog("ROOT_URL seems to have changed, new: \(newValue!), old: \(oldValue!)")
        }
        
        userDefaults.setURL(newValue, forKey: "MeteorWebAppRootURL")
        userDefaults.synchronize()
      }
    }
  }
  
  /// The Cordova compatibility version as specified in the asset manifest
  var cordovaCompatibilityVersion: String? {
    get {
      return userDefaults.stringForKey("MeteorWebAppCordovaCompatibilityVersion")
    }
    
    set {
      if newValue != cordovaCompatibilityVersion {
        if newValue == nil {
          userDefaults.removeObjectForKey("MeteorWebAppCordovaCompatibilityVersion")
        } else {
          userDefaults.setObject(newValue, forKey: "MeteorWebAppCordovaCompatibilityVersion")
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
      if newValue != lastSeenInitialVersion {
        if newValue == nil {
          userDefaults.removeObjectForKey("MeteorWebAppLastSeenInitialVersion")
        } else {
          userDefaults.setObject(newValue, forKey: "MeteorWebAppLastSeenInitialVersion")
        }
        userDefaults.synchronize()
      }
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
    cordovaCompatibilityVersion = nil
    lastSeenInitialVersion = nil
    lastDownloadedVersion = nil
    lastKnownGoodVersion = nil
    blacklistedVersions = []
  }
}
