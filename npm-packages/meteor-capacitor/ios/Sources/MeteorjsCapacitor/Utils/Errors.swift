// Vendored from https://github.com/banjerluke/capacitor-meteor-webapp
// Copyright 2025 Luke Abbott. MIT license. See LICENSES/banjerluke-capacitor-meteor-webapp.txt.

//
// Errors.swift
//
// Defines error types and error handling utilities for the plugin.
//

import Foundation

enum WebAppError: Error, CustomStringConvertible, LocalizedError {
    case invalidAssetManifest(reason: String, underlyingError: Error?)
    case fileSystemFailure(reason: String, underlyingError: Error?)
    case fileSystemError(reason: String, underlyingError: Error?)
    case downloadFailure(reason: String, underlyingError: Error?)
    case unsuitableAssetBundle(reason: String, underlyingError: Error?)

    var description: String {
        switch self {
        case .invalidAssetManifest(let reason, let underlyingError):
            return errorMessageWithReason(reason, underlyingError: underlyingError)
        case .fileSystemFailure(let reason, let underlyingError):
            return errorMessageWithReason(reason, underlyingError: underlyingError)
        case .fileSystemError(let reason, let underlyingError):
            return errorMessageWithReason(reason, underlyingError: underlyingError)
        case .downloadFailure(let reason, let underlyingError):
            return errorMessageWithReason(reason, underlyingError: underlyingError)
        case .unsuitableAssetBundle(let reason, let underlyingError):
            return errorMessageWithReason(reason, underlyingError: underlyingError)
        }
    }

    var errorDescription: String? {
        return description
    }
}

func errorMessageWithReason(_ reason: String, underlyingError: Error?) -> String {
    if let underlyingError = underlyingError {
        return "\(reason): \(underlyingError)"
    } else {
        return reason
    }
}

/// Errors specific to the hot code push functionality
public enum HotCodePushError: Error, LocalizedError {
    case noPendingVersion
    case noRootURLConfigured
    case bridgeUnavailable
    case initializationFailed(reason: String)
    case bundleOrganizationFailed(reason: String, underlyingError: Error?)
    case webViewUnavailable
    case downloadFailed(reason: String, underlyingError: Error?)

    public var errorDescription: String? {
        switch self {
        case .noPendingVersion:
            return "No pending version available to switch to"
        case .noRootURLConfigured:
            return "Root URL must be configured before checking for updates"
        case .bridgeUnavailable:
            return "Capacitor bridge is not available"
        case .initializationFailed(let reason):
            return "Failed to initialize: \(reason)"
        case .bundleOrganizationFailed(let reason, _):
            return "Failed to organize bundle: \(reason)"
        case .webViewUnavailable:
            return "WebView is not available"
        case .downloadFailed(let reason, _):
            return "Download failed: \(reason)"
        }
    }

    public var underlyingError: Error? {
        switch self {
        case .bundleOrganizationFailed(_, let error), .downloadFailed(_, let error):
            return error
        default:
            return nil
        }
    }
}
