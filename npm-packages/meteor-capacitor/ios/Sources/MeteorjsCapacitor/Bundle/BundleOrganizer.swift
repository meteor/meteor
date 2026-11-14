// Vendored from https://github.com/banjerluke/capacitor-meteor-webapp
// Copyright 2025 Luke Abbott. MIT license. See LICENSES/banjerluke-capacitor-meteor-webapp.txt.

//
// BundleOrganizer.swift
//
// Handles file organization logic for bundles, including URL path mapping
// and directory structure creation for Meteor webapp assets.
//

import Foundation
import os.log

/// Handles file organization logic for bundles, including URL path mapping and directory structure creation
public class BundleOrganizer {

    private static let logger = os.Logger(
        subsystem: "com.meteor.webapp", category: "BundleOrganizer")

    private struct PathValidationError: LocalizedError {
        let message: String
        var errorDescription: String? { message }
    }

    /// Organizes files in a bundle directory according to their URL mappings
    /// - Parameters:
    ///   - bundle: The asset bundle to organize
    ///   - targetDirectory: The directory where files should be organized
    /// - Throws: WebAppError if organization fails
    static func organizeBundle(_ bundle: AssetBundle, in targetDirectory: URL) throws {
        // Validate bundle before any file operations to prevent path traversal
        // and duplicate URL attacks from malicious manifests
        let validationErrors = validateBundleOrganization(bundle)
        if !validationErrors.isEmpty {
            throw WebAppError.unsuitableAssetBundle(
                reason: "Bundle validation failed: \(validationErrors.joined(separator: "; "))",
                underlyingError: nil)
        }

        let fileManager = FileManager.default

        // Create target directory if it doesn't exist
        try fileManager.createDirectory(
            at: targetDirectory, withIntermediateDirectories: true, attributes: nil)

        var skippedAssets: [String] = []

        // Organize own assets
        for asset in bundle.ownAssets {
            try organizeAsset(asset, in: targetDirectory, fileManager: fileManager, skippedAssets: &skippedAssets)
        }

        // Also organize parent assets that this bundle inherits but doesn't override
        if let parentBundle = bundle.parentAssetBundle {
            for parentAsset in parentBundle.ownAssets {
                // Only organize parent assets that we don't have in our own assets
                if bundle.ownAssetsByURLPath[parentAsset.urlPath] == nil {
                    try organizeAsset(parentAsset, in: targetDirectory, fileManager: fileManager, skippedAssets: &skippedAssets)
                }
            }
        }

        if !skippedAssets.isEmpty {
            logger.warning("Bundle organization completed with \(skippedAssets.count) missing asset(s) | bundleVersion=\(bundle.version) | skipped=\(skippedAssets)")
        }
    }

    /// Organizes a single asset according to its URL path mapping
    /// - Parameters:
    ///   - asset: The asset to organize
    ///   - targetDirectory: The target directory
    ///   - fileManager: File manager instance
    /// - Throws: WebAppError if organization fails
    private static func organizeAsset(
        _ asset: Asset, in targetDirectory: URL, fileManager: FileManager,
        skippedAssets: inout [String]
    ) throws {
        let sourceURL = asset.fileURL
        let targetURL = targetURLForAsset(asset, in: targetDirectory)

        // Ensure the target directory structure exists
        let targetDirectoryURL = targetURL.deletingLastPathComponent()
        try fileManager.createDirectory(
            at: targetDirectoryURL, withIntermediateDirectories: true, attributes: nil)

        // Check if source file exists
        guard fileManager.fileExists(atPath: sourceURL.path) else {
            if asset.urlPath.hasSuffix(".map") || asset.fileURL.pathExtension == "map" {
                // Skip missing source maps silently
                return
            }
            if asset.urlPath == "/" || asset.urlPath == "/index.html" {
                logger.error("Source file missing for critical asset: \(asset.urlPath), Expected path: \(sourceURL.path)")
                throw WebAppError.fileSystemError(
                    reason: "Source file does not exist: \(sourceURL.path)", underlyingError: nil)
            }
            logger.warning("Missing asset skipped during bundle organization | urlPath=\(asset.urlPath) | filePath=\(asset.filePath) | bundleVersion=\(asset.bundle.version)")
            skippedAssets.append(asset.urlPath)
            return
        }

        // If target already exists, remove it first
        if fileManager.fileExists(atPath: targetURL.path) {
            try fileManager.removeItem(at: targetURL)
        }

        if asset.urlPath == "/" || asset.urlPath == "/index.html" {
            // Special handling for index.html - inject WebAppLocalServer shim
            try organizeIndexHtml(sourceURL: sourceURL, targetURL: targetURL)
        } else {
            // Try to create hard link first (for efficiency), fall back to copy
            do {
                try fileManager.linkItem(at: sourceURL, to: targetURL)
            } catch {
                // Hard link failed, try copying instead
                do {
                    try fileManager.copyItem(at: sourceURL, to: targetURL)
                } catch {
                    throw WebAppError.fileSystemError(
                        reason: "Failed to organize asset \(asset.urlPath)", underlyingError: error)
                }
            }
        }
    }

    /// Special handling for index.html files to inject WebAppLocalServer shim
    /// - Parameters:
    ///   - sourceURL: Source index.html file
    ///   - targetURL: Target location for the modified index.html
    /// - Throws: WebAppError if processing fails
    private static func organizeIndexHtml(sourceURL: URL, targetURL: URL) throws {
        // Read the original HTML content
        let originalContent: String
        do {
            originalContent = try String(contentsOf: sourceURL, encoding: .utf8)
        } catch {
            throw WebAppError.fileSystemError(
                reason: "Failed to read index.html content", underlyingError: error)
        }

        // WebAppLocalServer compatibility shim for Capacitor
        // Provides the same API as cordova-plugin-meteor-webapp
        let shimScript = """
            <script>
            (function() {
                if (window.WebAppLocalServer) return;

                setupWebAppLocalServer();

                function setupWebAppLocalServer() {
                    // Resolve plugin lazily — the Capacitor bridge may not have
                    // registered plugins yet when the shim first initializes
                    var _P;
                    function getPlugin() {
                        if (!_P) _P = ((window.Capacitor || {}).Plugins || {}).CapacitorMeteorWebApp;
                        if (!_P) console.warn('WebAppLocalServer shim: CapacitorMeteorWebApp plugin not available');
                        return _P;
                    }

                    window.WebAppLocalServer = {
                        startupDidComplete(callback) {
                            var P = getPlugin(); if (!P) return;
                            P.startupDidComplete()
                            .then(function() { if (callback) callback(); })
                            .catch(function(error) { console.error('WebAppLocalServer.startupDidComplete() failed:', error); });
                        },

                        checkForUpdates(callback) {
                            var P = getPlugin(); if (!P) return;
                            P.checkForUpdates()
                            .then(function() { if (callback) callback(); })
                            .catch(function(error) { console.error('WebAppLocalServer.checkForUpdates() failed:', error); });
                        },

                        onNewVersionReady(callback) {
                            var P = getPlugin(); if (!P) return;
                            P.addListener('updateAvailable', function(event) { callback(event.version); });
                        },

                        switchToPendingVersion(callback, errorCallback) {
                            var P = getPlugin(); if (!P) return;
                            P.reload()
                            .then(function() { if (callback) callback(); })
                            .catch(function(error) {
                                console.error('switchToPendingVersion failed:', error);
                                if (typeof errorCallback === 'function') errorCallback(error);
                            });
                        },

                        onError(callback) {
                            var P = getPlugin(); if (!P) return;
                            P.addListener('error', function(event) {
                                var error = new Error(event.message || 'Unknown CapacitorMeteorWebApp error');
                                callback(error);
                            });
                        },

                        localFileSystemUrl(_fileUrl) {
                            throw new Error('Local filesystem URLs not supported by Capacitor');
                        },
                    };
                }
            })();
            </script>
        """

        // Inject the shim before closing </head> tag, or before </body> if no head
        let modifiedContent: String
        if let headCloseRange = originalContent.range(of: "</head>", options: .caseInsensitive) {
            modifiedContent = originalContent.replacingCharacters(in: headCloseRange, with: shimScript + "\n</head>")
        } else if let bodyCloseRange = originalContent.range(of: "</body>", options: .caseInsensitive) {
            modifiedContent = originalContent.replacingCharacters(in: bodyCloseRange, with: shimScript + "\n</body>")
        } else {
            // Just append to the end if we can't find head or body tags
            modifiedContent = originalContent + shimScript
        }

        do {
            try modifiedContent.write(to: targetURL, atomically: true, encoding: .utf8)
        } catch {
            throw WebAppError.fileSystemError(reason: "Failed to write modified index.html", underlyingError: error)
        }
    }

    /// Calculates the target URL for an asset based on its URL path mapping
    /// - Parameters:
    ///   - asset: The asset
    ///   - targetDirectory: The target directory
    /// - Returns: The URL where the asset should be placed
    static func targetURLForAsset(_ asset: Asset, in targetDirectory: URL) -> URL {
        // Remove leading slash from URL path to make it relative
        var relativePath = asset.urlPath
        if relativePath.hasPrefix("/") {
            relativePath = String(relativePath.dropFirst())
        }

        // Handle root path (/) -> index.html
        if relativePath.isEmpty {
            relativePath = "index.html"
        }

        return targetDirectory.appendingPathComponent(relativePath)
    }

    /// Validates that all assets in a bundle can be properly organized
    /// - Parameter bundle: The bundle to validate
    /// - Returns: Array of validation errors (empty if valid)
    static func validateBundleOrganization(_ bundle: AssetBundle) -> [String] {
        var errors: [String] = []
        var normalizedURLPaths = Set<String>()

        for asset in bundle.ownAssets {
            let normalizedURLPath: String
            do {
                normalizedURLPath = try normalizeURLPath(asset.urlPath)
            } catch {
                errors.append(
                    "Invalid urlPath for asset '\(asset.urlPath)': \(error.localizedDescription)")
                continue
            }

            if !normalizedURLPaths.insert(normalizedURLPath).inserted {
                errors.append("Duplicate normalized URL path: \(normalizedURLPath)")
            }

            do {
                _ = try normalizeRelativeFilePath(asset.filePath)
            } catch {
                errors.append(
                    "Invalid filePath for asset '\(asset.filePath)': \(error.localizedDescription)")
            }
        }

        return errors
    }

    private static func normalizeURLPath(_ rawURLPath: String) throws -> String {
        if rawURLPath.isEmpty {
            throw PathValidationError(message: "path is empty")
        }

        var path = URLPathByRemovingQueryString(rawURLPath)
        if path.hasPrefix("/") {
            path.removeFirst()
        }

        if path.isEmpty {
            return "index.html"
        }

        return try normalizePath(path)
    }

    private static func normalizeRelativeFilePath(_ rawFilePath: String) throws -> String {
        if rawFilePath.isEmpty {
            throw PathValidationError(message: "path is empty")
        }

        if rawFilePath.hasPrefix("/") {
            throw PathValidationError(message: "absolute paths are not allowed")
        }

        return try normalizePath(rawFilePath)
    }

    private static func normalizePath(_ path: String) throws -> String {
        if path.contains("\\") {
            throw PathValidationError(message: "backslashes are not allowed")
        }

        let segments = path.split(separator: "/", omittingEmptySubsequences: false)
        var normalizedSegments: [Substring] = []

        for segment in segments {
            if segment.isEmpty {
                throw PathValidationError(message: "empty path segments are not allowed")
            }

            if segment == "." || segment == ".." {
                throw PathValidationError(message: "path traversal segments are not allowed")
            }

            normalizedSegments.append(segment)
        }

        return normalizedSegments.joined(separator: "/")
    }

    /// Removes organized files from a target directory
    /// - Parameter targetDirectory: Directory to clean up
    /// - Throws: WebAppError if cleanup fails
    public static func cleanupOrganizedBundle(at targetDirectory: URL) throws {
        let fileManager = FileManager.default

        guard fileManager.fileExists(atPath: targetDirectory.path) else {
            return  // Nothing to clean up
        }

        do {
            try fileManager.removeItem(at: targetDirectory)
        } catch {
            throw WebAppError.fileSystemError(
                reason: "Failed to cleanup bundle directory", underlyingError: error)
        }
    }
}
