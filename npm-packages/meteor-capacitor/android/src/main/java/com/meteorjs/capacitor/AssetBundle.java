/*
 * Vendored from https://github.com/banjerluke/capacitor-meteor-webapp
 * Copyright 2025 Luke Abbott. MIT license. See LICENSES/banjerluke-capacitor-meteor-webapp.txt.
 */

package com.meteorjs.capacitor;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.Collection;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

final class AssetBundle {

    @FunctionalInterface
    interface ResourceReader {
        InputStream open(String relativePath) throws IOException;
    }

    static final class RuntimeConfig {
        private final JSONObject json;

        RuntimeConfig(JSONObject json) {
            this.json = json;
        }

        String getAppId() {
            return json.optString("appId", null);
        }

        String getRootUrlString() {
            return json.optString("ROOT_URL", null);
        }

        String getAutoupdateVersionCordova() {
            return json.optString("autoupdateVersionCordova", null);
        }
    }

    private static final Pattern RUNTIME_CONFIG_PATTERN = Pattern.compile(
        "__meteor_runtime_config__ = JSON.parse\\(decodeURIComponent\\(\\\"([^\\\"]*)\\\"\\)\\)"
    );

    private String sourceDescription;
    private File directory;
    private ResourceReader resourceReader;

    private final String version;
    private final String cordovaCompatibilityVersion;

    private final AssetBundle parentAssetBundle;
    private final Map<String, Asset> ownAssetsByUrlPath = new LinkedHashMap<>();
    private Asset indexFile;
    private RuntimeConfig runtimeConfig;

    private AssetBundle(
        String sourceDescription,
        File directory,
        ResourceReader resourceReader,
        AssetManifest manifest,
        AssetBundle parentAssetBundle
    ) throws WebAppError {
        this.sourceDescription = sourceDescription;
        this.directory = directory;
        this.resourceReader = resourceReader;
        this.parentAssetBundle = parentAssetBundle;
        this.version = manifest.version;
        this.cordovaCompatibilityVersion = manifest.cordovaCompatibilityVersion;

        for (AssetManifest.Entry entry : manifest.entries) {
            String normalizedUrlPath = WebAppUtils.removeQueryStringFromUrlPath(entry.urlPath);
            if (parentAssetBundle == null || parentAssetBundle.cachedAssetForUrlPath(normalizedUrlPath, entry.hash) == null) {
                addAsset(
                    new Asset(
                        this,
                        entry.filePath,
                        normalizedUrlPath,
                        entry.fileType,
                        entry.cacheable,
                        entry.hash,
                        entry.sourceMapUrlPath
                    )
                );
            }

            if (entry.sourceMapFilePath != null && entry.sourceMapUrlPath != null) {
                if (parentAssetBundle == null || parentAssetBundle.cachedAssetForUrlPath(entry.sourceMapUrlPath, null) == null) {
                    addAsset(
                        new Asset(
                            this,
                            entry.sourceMapFilePath,
                            entry.sourceMapUrlPath,
                            "json",
                            true,
                            null,
                            null
                        )
                    );
                }
            }
        }

        Asset indexAsset = new Asset(this, "index.html", "/", "html", false, null, null);
        addAsset(indexAsset);
        indexFile = indexAsset;
    }

    static AssetBundle fromDirectory(File directory, AssetBundle parentAssetBundle) throws WebAppError {
        ResourceReader reader = relativePath -> new FileInputStream(new File(directory, relativePath));
        AssetManifest manifest;
        try (InputStream inputStream = reader.open("program.json")) {
            manifest = new AssetManifest(readUtf8(inputStream));
        } catch (IOException e) {
            throw new WebAppError(
                WebAppError.Type.INVALID_ASSET_MANIFEST,
                "Error loading asset manifest from directory: " + directory.getAbsolutePath(),
                e
            );
        }

        return new AssetBundle(directory.getAbsolutePath(), directory, reader, manifest, parentAssetBundle);
    }

    static AssetBundle fromReader(String sourceDescription, ResourceReader reader, AssetBundle parentAssetBundle) throws WebAppError {
        AssetManifest manifest;
        try (InputStream inputStream = reader.open("program.json")) {
            manifest = new AssetManifest(readUtf8(inputStream));
        } catch (IOException e) {
            throw new WebAppError(
                WebAppError.Type.INVALID_ASSET_MANIFEST,
                "Error loading asset manifest from: " + sourceDescription,
                e
            );
        }

        return new AssetBundle(sourceDescription, null, reader, manifest, parentAssetBundle);
    }

    Collection<Asset> getOwnAssets() {
        return Collections.unmodifiableCollection(ownAssetsByUrlPath.values());
    }

    Map<String, Asset> getOwnAssetsByUrlPath() {
        return Collections.unmodifiableMap(ownAssetsByUrlPath);
    }

    AssetBundle getParentAssetBundle() {
        return parentAssetBundle;
    }

    Asset assetForUrlPath(String urlPath) {
        Asset asset = ownAssetsByUrlPath.get(urlPath);
        if (asset != null) {
            return asset;
        }

        if (parentAssetBundle == null) {
            return null;
        }

        return parentAssetBundle.assetForUrlPath(urlPath);
    }

    Asset cachedAssetForUrlPath(String urlPath, String expectedHash) {
        Asset asset = ownAssetsByUrlPath.get(urlPath);
        if (asset == null) {
            return null;
        }

        if ((asset.cacheable && expectedHash == null) || (asset.hash != null && asset.hash.equals(expectedHash))) {
            return asset;
        }

        return null;
    }

    boolean assetExistsInBundle(String urlPath) {
        return ownAssetsByUrlPath.containsKey(urlPath);
    }

    String getVersion() {
        return version;
    }

    String getCordovaCompatibilityVersion() {
        return cordovaCompatibilityVersion;
    }

    Asset getIndexFile() {
        return indexFile;
    }

    RuntimeConfig getRuntimeConfig() throws WebAppError {
        if (runtimeConfig != null) {
            return runtimeConfig;
        }

        if (indexFile == null) {
            return null;
        }

        try (InputStream inputStream = openAsset(indexFile.filePath)) {
            String indexHtml = readUtf8(inputStream);
            Matcher matcher = RUNTIME_CONFIG_PATTERN.matcher(indexHtml);
            if (!matcher.find()) {
                throw new WebAppError(
                    WebAppError.Type.UNSUITABLE_ASSET_BUNDLE,
                    "Could not load runtime config from index file"
                );
            }

            String decoded = URLDecoder.decode(matcher.group(1), StandardCharsets.UTF_8.name());
            runtimeConfig = new RuntimeConfig(new JSONObject(decoded));
            return runtimeConfig;
        } catch (IOException | JSONException e) {
            throw new WebAppError(
                WebAppError.Type.UNSUITABLE_ASSET_BUNDLE,
                "Could not load runtime config from index file",
                e
            );
        }
    }

    String getAppId() {
        try {
            RuntimeConfig config = getRuntimeConfig();
            return config == null ? null : config.getAppId();
        } catch (WebAppError ignored) {
            return null;
        }
    }

    String getRootUrlString() {
        try {
            RuntimeConfig config = getRuntimeConfig();
            return config == null ? null : config.getRootUrlString();
        } catch (WebAppError ignored) {
            return null;
        }
    }

    void didMoveToDirectoryAtUrl(File newDirectory) {
        this.directory = newDirectory;
        this.sourceDescription = newDirectory.getAbsolutePath();
        this.resourceReader = relativePath -> new FileInputStream(new File(newDirectory, relativePath));
    }

    InputStream openAsset(String relativePath) throws IOException {
        return resourceReader.open(relativePath);
    }

    File resolveFile(String relativePath) {
        if (directory == null) {
            return null;
        }
        return new File(directory, relativePath);
    }

    String getSourceDescription() {
        return sourceDescription;
    }

    private void addAsset(Asset asset) {
        ownAssetsByUrlPath.put(asset.urlPath, asset);
    }

    private static String readUtf8(InputStream inputStream) throws IOException {
        StringBuilder builder = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(inputStream, StandardCharsets.UTF_8))) {
            char[] buffer = new char[4096];
            int count;
            while ((count = reader.read(buffer)) != -1) {
                builder.append(buffer, 0, count);
            }
        }
        return builder.toString();
    }
}
