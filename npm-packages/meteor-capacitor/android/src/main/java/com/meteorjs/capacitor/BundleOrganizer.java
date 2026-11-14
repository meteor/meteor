/*
 * Vendored from https://github.com/banjerluke/capacitor-meteor-webapp
 * Copyright 2025 Luke Abbott. MIT license. See LICENSES/banjerluke-capacitor-meteor-webapp.txt.
 */

package com.meteorjs.capacitor;

import android.util.Log;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

final class BundleOrganizer {

    private static final String LOG_TAG = "CapacitorMeteorWebApp";

    private static final String SHIM_SCRIPT =
        "<script>\n"
            + "(function() {\n"
            + "    if (window.WebAppLocalServer) return;\n"
            + "\n"
            + "    setupWebAppLocalServer();\n"
            + "\n"
            + "    function setupWebAppLocalServer() {\n"
            + "        var _P;\n"
            + "        function getPlugin() {\n"
            + "            if (!_P) _P = ((window.Capacitor || {}).Plugins || {}).CapacitorMeteorWebApp;\n"
            + "            if (!_P) console.warn('WebAppLocalServer shim: CapacitorMeteorWebApp plugin not available');\n"
            + "            return _P;\n"
            + "        }\n"
            + "\n"
            + "        window.WebAppLocalServer = {\n"
            + "            startupDidComplete(callback) {\n"
            + "                var P = getPlugin(); if (!P) return;\n"
            + "                P.startupDidComplete()\n"
            + "                .then(function() { if (callback) callback(); })\n"
            + "                .catch(function(error) { console.error('WebAppLocalServer.startupDidComplete() failed:', error); });\n"
            + "            },\n"
            + "\n"
            + "            checkForUpdates(callback) {\n"
            + "                var P = getPlugin(); if (!P) return;\n"
            + "                P.checkForUpdates()\n"
            + "                .then(function() { if (callback) callback(); })\n"
            + "                .catch(function(error) { console.error('WebAppLocalServer.checkForUpdates() failed:', error); });\n"
            + "            },\n"
            + "\n"
            + "            onNewVersionReady(callback) {\n"
            + "                var P = getPlugin(); if (!P) return;\n"
            + "                P.addListener('updateAvailable', function(event) { callback(event.version); });\n"
            + "            },\n"
            + "\n"
            + "            switchToPendingVersion(callback, errorCallback) {\n"
            + "                var P = getPlugin(); if (!P) return;\n"
            + "                P.reload()\n"
            + "                .then(function() { if (callback) callback(); })\n"
            + "                .catch(function(error) {\n"
            + "                    console.error('switchToPendingVersion failed:', error);\n"
            + "                    if (typeof errorCallback === 'function') errorCallback(error);\n"
            + "                });\n"
            + "            },\n"
            + "\n"
            + "            onError(callback) {\n"
            + "                var P = getPlugin(); if (!P) return;\n"
            + "                P.addListener('error', function(event) {\n"
            + "                    var error = new Error(event.message || 'Unknown CapacitorMeteorWebApp error');\n"
            + "                    callback(error);\n"
            + "                });\n"
            + "            },\n"
            + "\n"
            + "            localFileSystemUrl(_fileUrl) {\n"
            + "                throw new Error('Local filesystem URLs not supported by Capacitor');\n"
            + "            },\n"
            + "        };\n"
            + "    }\n"
            + "})();\n"
            + "</script>";

    private BundleOrganizer() {}

    static void organizeBundle(AssetBundle bundle, File targetDirectory) throws WebAppError {
        List<String> validationErrors = validateBundleOrganization(bundle);
        if (!validationErrors.isEmpty()) {
            throw new WebAppError(
                WebAppError.Type.UNSUITABLE_ASSET_BUNDLE,
                "Bundle validation failed: " + String.join("; ", validationErrors)
            );
        }

        if (!targetDirectory.exists() && !targetDirectory.mkdirs() && !targetDirectory.isDirectory()) {
            throw new WebAppError(
                WebAppError.Type.FILE_SYSTEM_ERROR,
                "Failed to create bundle target directory: " + targetDirectory.getAbsolutePath()
            );
        }

        List<String> skippedAssets = new ArrayList<>();

        for (Asset asset : bundle.getOwnAssets()) {
            organizeAsset(asset, targetDirectory, skippedAssets);
        }

        AssetBundle parentBundle = bundle.getParentAssetBundle();
        if (parentBundle != null) {
            for (Asset parentAsset : parentBundle.getOwnAssets()) {
                if (bundle.getOwnAssetsByUrlPath().containsKey(parentAsset.urlPath)) {
                    continue;
                }
                organizeAsset(parentAsset, targetDirectory, skippedAssets);
            }
        }

        if (!skippedAssets.isEmpty()) {
            logWarning("Bundle organization completed with " + skippedAssets.size()
                + " missing asset(s) | bundleVersion=" + bundle.getVersion()
                + " | skipped=" + skippedAssets);
        }
    }

    static List<String> validateBundleOrganization(AssetBundle bundle) {
        List<String> errors = new ArrayList<>();
        Set<String> normalizedUrlPaths = new HashSet<>();

        for (Asset asset : bundle.getOwnAssets()) {
            String normalizedUrlPath;
            try {
                normalizedUrlPath = normalizeUrlPath(asset.urlPath);
            } catch (IllegalArgumentException e) {
                errors.add("Invalid urlPath for asset '" + asset.urlPath + "': " + e.getMessage());
                continue;
            }

            if (!normalizedUrlPaths.add(normalizedUrlPath)) {
                errors.add("Duplicate normalized URL path: " + normalizedUrlPath);
            }

            try {
                normalizeRelativeFilePath(asset.filePath);
            } catch (IllegalArgumentException e) {
                errors.add("Invalid filePath for asset '" + asset.filePath + "': " + e.getMessage());
            }
        }

        return errors;
    }

    static File targetFileForAsset(Asset asset, File targetDirectory) {
        String normalizedUrlPath = normalizeUrlPath(asset.urlPath);
        return new File(targetDirectory, normalizedUrlPath);
    }

    static void cleanupOrganizedBundle(File targetDirectory) throws WebAppError {
        if (!targetDirectory.exists()) {
            return;
        }

        if (!FileOps.deleteRecursively(targetDirectory)) {
            throw new WebAppError(
                WebAppError.Type.FILE_SYSTEM_ERROR,
                "Failed to cleanup organized bundle at " + targetDirectory.getAbsolutePath()
            );
        }
    }

    private static void organizeAsset(Asset asset, File targetDirectory, List<String> skippedAssets)
        throws WebAppError {
        final File targetFile;
        try {
            targetFile = targetFileForAsset(asset, targetDirectory);
        } catch (IllegalArgumentException e) {
            throw new WebAppError(
                WebAppError.Type.UNSUITABLE_ASSET_BUNDLE,
                "Invalid asset URL path while organizing: " + asset.urlPath,
                e
            );
        }
        ensureTargetWithinDirectory(targetFile, targetDirectory);

        try {
            FileOps.ensureParentDirectory(targetFile);

            if (isIndexAsset(asset)) {
                organizeIndexHtml(asset, targetFile);
                return;
            }

            try (InputStream source = asset.bundle.openAsset(asset.filePath)) {
                FileOps.copy(source, targetFile);
            }
        } catch (FileNotFoundException e) {
            // index.html is handled by organizeIndexHtml() above which throws its
            // own WebAppError if the file is missing, so only non-index assets
            // reach this catch block.
            if (isSourceMapAsset(asset)) {
                return;
            }
            logWarning("Missing asset skipped during bundle organization"
                + " | urlPath=" + asset.urlPath
                + " | filePath=" + asset.filePath
                + " | bundleVersion=" + asset.bundle.getVersion());
            skippedAssets.add(asset.urlPath);
        } catch (IOException e) {
            throw new WebAppError(
                WebAppError.Type.FILE_SYSTEM_ERROR,
                "Failed to organize asset: " + asset.urlPath,
                e
            );
        }
    }

    private static void organizeIndexHtml(Asset asset, File targetFile) throws WebAppError {
        try (InputStream source = asset.bundle.openAsset(asset.filePath)) {
            String originalContent = readUtf8(source);
            String modifiedContent = injectShim(originalContent);
            try (InputStream output = new ByteArrayInputStream(modifiedContent.getBytes(StandardCharsets.UTF_8))) {
                FileOps.copy(output, targetFile);
            }
        } catch (IOException e) {
            throw new WebAppError(
                WebAppError.Type.FILE_SYSTEM_ERROR,
                "Failed to process index.html",
                e
            );
        }
    }

    private static String readUtf8(InputStream inputStream) throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[4096];
        int read;
        while ((read = inputStream.read(buffer)) != -1) {
            output.write(buffer, 0, read);
        }
        return new String(output.toByteArray(), StandardCharsets.UTF_8);
    }

    private static String injectShim(String html) {
        String headTag = "</head>";
        String bodyTag = "</body>";

        int headIndex = indexOfIgnoreCase(html, headTag);
        if (headIndex >= 0) {
            return html.substring(0, headIndex) + SHIM_SCRIPT + "\n" + html.substring(headIndex);
        }

        int bodyIndex = indexOfIgnoreCase(html, bodyTag);
        if (bodyIndex >= 0) {
            return html.substring(0, bodyIndex) + SHIM_SCRIPT + "\n" + html.substring(bodyIndex);
        }

        return html + SHIM_SCRIPT;
    }

    private static int indexOfIgnoreCase(String source, String value) {
        return source.toLowerCase(Locale.US).indexOf(value.toLowerCase(Locale.US));
    }

    private static boolean isIndexAsset(Asset asset) {
        return "/".equals(asset.urlPath) || "/index.html".equals(asset.urlPath);
    }

    private static boolean isSourceMapAsset(Asset asset) {
        return asset.urlPath.endsWith(".map") || asset.filePath.endsWith(".map");
    }

    private static void logWarning(String message) {
        try {
            Log.w(LOG_TAG, message);
        } catch (RuntimeException ignored) {
            // Local JVM tests do not mock android.util.Log; keep behavior test-safe.
            System.err.println(LOG_TAG + " WARN: " + message);
        }
    }

    private static String normalizeUrlPath(String rawUrlPath) {
        if (rawUrlPath == null || rawUrlPath.isEmpty()) {
            throw new IllegalArgumentException("path is empty");
        }

        String withoutQuery = WebAppUtils.removeQueryStringFromUrlPath(rawUrlPath);
        String path = withoutQuery;
        if (path.startsWith("/")) {
            path = path.substring(1);
        }

        if (path.isEmpty()) {
            return "index.html";
        }

        return normalizePath(path);
    }

    private static String normalizeRelativeFilePath(String rawFilePath) {
        if (rawFilePath == null || rawFilePath.isEmpty()) {
            throw new IllegalArgumentException("path is empty");
        }

        if (rawFilePath.startsWith("/")) {
            throw new IllegalArgumentException("absolute paths are not allowed");
        }

        return normalizePath(rawFilePath);
    }

    private static String normalizePath(String path) {
        if (path.contains("\\")) {
            throw new IllegalArgumentException("backslashes are not allowed");
        }

        String[] segments = path.split("/");
        StringBuilder normalized = new StringBuilder();

        for (String segment : segments) {
            if (segment.isEmpty()) {
                throw new IllegalArgumentException("empty path segments are not allowed");
            }
            if (".".equals(segment) || "..".equals(segment)) {
                throw new IllegalArgumentException("path traversal segments are not allowed");
            }

            if (normalized.length() > 0) {
                normalized.append('/');
            }
            normalized.append(segment);
        }

        return normalized.toString();
    }

    private static void ensureTargetWithinDirectory(File targetFile, File targetDirectory) throws WebAppError {
        try {
            String targetCanonical = targetFile.getCanonicalPath();
            String rootCanonical = targetDirectory.getCanonicalPath();

            if (!targetCanonical.equals(rootCanonical) && !targetCanonical.startsWith(rootCanonical + File.separator)) {
                throw new WebAppError(
                    WebAppError.Type.UNSUITABLE_ASSET_BUNDLE,
                    "Asset target escapes serving directory: " + targetFile.getPath()
                );
            }
        } catch (IOException e) {
            throw new WebAppError(
                WebAppError.Type.FILE_SYSTEM_ERROR,
                "Failed to validate serving target path",
                e
            );
        }
    }
}
