// Vendored from https://github.com/banjerluke/capacitor-meteor-webapp
// Copyright 2025 Luke Abbott. MIT license. See LICENSES/banjerluke-capacitor-meteor-webapp.txt.

//
// WebAppConfiguration.swift
//
// Manages configuration and settings for the Meteor webapp, including
// persistence of app state and runtime configuration values.
//
// This file is copied directly from cordova-plugin-meteor-webapp with
// minimal changes to adapt for Capacitor.
//

import Foundation

final class WebAppConfiguration {
    let userDefaults: UserDefaults

    init(userDefaults: UserDefaults = .standard) {
        self.userDefaults = userDefaults
    }

    /// The appId as defined in the runtime config
    var appId: String? {
        get {
            return userDefaults.string(forKey: "MeteorWebAppId")
        }
        set {
            let oldValue = appId
            if newValue != oldValue {
                if oldValue != nil {
                    NSLog("appId seems to have changed, new: \(String(describing: newValue)), old: \(oldValue!)")
                }
                if let newValue {
                    userDefaults.set(newValue, forKey: "MeteorWebAppId")
                } else {
                    userDefaults.removeObject(forKey: "MeteorWebAppId")
                }
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
            if newValue != oldValue {
                if oldValue != nil {
                    NSLog("ROOT_URL seems to have changed, new: \(String(describing: newValue)), old: \(oldValue!)")
                }
                if let newValue {
                    userDefaults.set(newValue, forKey: "MeteorWebAppRootURL")
                } else {
                    userDefaults.removeObject(forKey: "MeteorWebAppRootURL")
                }
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
                if newValue == nil {
                    userDefaults.removeObject(forKey: "MeteorWebAppLastKnownGoodVersion")
                } else {
                    userDefaults.set(newValue, forKey: "MeteorWebAppLastKnownGoodVersion")
                }
            }
        }
    }

    /// Blacklisted asset bundle versions
    var blacklistedVersions: [String] {
        get {
            let versions =
                userDefaults.array(forKey: "MeteorWebAppBlacklistedVersions") as? [String] ?? []
            if !versions.isEmpty {
                NSLog("BLACKLIST - blacklistedVersions: \(versions)")
            }
            return versions
        }

        set {
            if newValue != blacklistedVersions {
                if newValue.isEmpty {
                    NSLog("BLACKLIST - removing blacklisted versions")
                    userDefaults.removeObject(forKey: "MeteorWebAppBlacklistedVersions")
                } else {
                    userDefaults.set(newValue, forKey: "MeteorWebAppBlacklistedVersions")
                }
            }
        }
    }

    var versionsToRetry: [String] {
        get {
            let versions = userDefaults.array(forKey: "MeteorWebAppVersionsToRetry") as? [String] ?? []
            if !versions.isEmpty {
                NSLog("BLACKLIST - versionsToRetry: \(versions)")
            }
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
            }
        }
    }

    func addBlacklistedVersion(_ version: String) {
        var blacklistedVersions = self.blacklistedVersions
        var versionsToRetry = self.versionsToRetry

        if !versionsToRetry.contains(version) && !blacklistedVersions.contains(version) {
            NSLog("BLACKLIST - adding faulty version to retry: \(version)")
            versionsToRetry.append(version)
            self.versionsToRetry = versionsToRetry
        } else {
            if let index = versionsToRetry.firstIndex(of: version) {
                versionsToRetry.remove(at: index)
                self.versionsToRetry = versionsToRetry
            }
            if !blacklistedVersions.contains(version) {
                blacklistedVersions.append(version)
                NSLog("BLACKLIST - blacklisting version: \(version)")
                self.blacklistedVersions = blacklistedVersions
            }
        }
    }

    func reset() {
        appId = nil
        rootURL = nil
        cordovaCompatibilityVersion = nil
        lastSeenInitialVersion = nil
        lastDownloadedVersion = nil
        lastKnownGoodVersion = nil
        blacklistedVersions = []
        versionsToRetry = []
    }
}
