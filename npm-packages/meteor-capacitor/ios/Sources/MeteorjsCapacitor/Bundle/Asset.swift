// Vendored from https://github.com/banjerluke/capacitor-meteor-webapp
// Copyright 2025 Luke Abbott. MIT license. See LICENSES/banjerluke-capacitor-meteor-webapp.txt.

//
// Asset.swift
//
// Represents a single asset file within a Meteor app bundle, including
// its metadata like file path, URL path, type, and hash.
//
// This file is copied directly from cordova-plugin-meteor-webapp with
// minimal changes to adapt for Capacitor.
//

import Foundation

struct Asset {
    let bundle: AssetBundle
    let filePath: String
    var fileURL: URL {
        return bundle.directoryURL.appendingPathComponent(filePath, isDirectory: false)
    }
    let urlPath: String
    let fileType: String?
    let cacheable: Bool
    let hash: String?
    let sourceMapURLPath: String?

    init(
        bundle: AssetBundle, filePath: String, urlPath: String, fileType: String? = nil,
        cacheable: Bool, hash: String? = nil, sourceMapURLPath: String? = nil
    ) {
        self.bundle = bundle
        self.filePath = filePath
        self.urlPath = urlPath
        self.fileType = fileType
        self.cacheable = cacheable
        self.hash = hash
        self.sourceMapURLPath = sourceMapURLPath
    }
}

extension Asset: CustomStringConvertible {
    var description: String {
        return urlPath
    }
}

extension Asset: Hashable, Equatable {
    func hash(into hasher: inout Hasher) {
        hasher.combine(ObjectIdentifier(bundle))
        hasher.combine(urlPath)
    }

    static func == (lhs: Asset, rhs: Asset) -> Bool {
        return ObjectIdentifier(lhs.bundle) == ObjectIdentifier(rhs.bundle)
            && lhs.urlPath == rhs.urlPath
    }
}
