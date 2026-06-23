/*
 * Vendored from https://github.com/banjerluke/capacitor-meteor-webapp
 * Copyright 2025 Luke Abbott. MIT license. See LICENSES/banjerluke-capacitor-meteor-webapp.txt.
 */

package com.meteorjs.capacitor;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

final class AssetManifest {

    static final class Entry {
        final String filePath;
        final String urlPath;
        final String fileType;
        final boolean cacheable;
        final String hash;
        final String sourceMapFilePath;
        final String sourceMapUrlPath;

        Entry(
            String filePath,
            String urlPath,
            String fileType,
            boolean cacheable,
            String hash,
            String sourceMapFilePath,
            String sourceMapUrlPath
        ) {
            this.filePath = filePath;
            this.urlPath = urlPath;
            this.fileType = fileType;
            this.cacheable = cacheable;
            this.hash = hash;
            this.sourceMapFilePath = sourceMapFilePath;
            this.sourceMapUrlPath = sourceMapUrlPath;
        }
    }

    final String version;
    final String cordovaCompatibilityVersion;
    final List<Entry> entries;

    AssetManifest(String jsonString) throws WebAppError {
        try {
            JSONObject json = new JSONObject(jsonString);
            String format = json.optString("format", null);
            if (format != null && !"web-program-pre1".equals(format)) {
                throw new WebAppError(
                    WebAppError.Type.INVALID_ASSET_MANIFEST,
                    "The asset manifest format is incompatible: " + format
                );
            }

            version = json.optString("version", null);
            if (version == null) {
                throw new WebAppError(
                    WebAppError.Type.INVALID_ASSET_MANIFEST,
                    "Asset manifest does not have a version"
                );
            }

            JSONObject compatibility = json.optJSONObject("cordovaCompatibilityVersions");
            if (compatibility == null) {
                throw new WebAppError(
                    WebAppError.Type.INVALID_ASSET_MANIFEST,
                    "Asset manifest does not have cordovaCompatibilityVersions"
                );
            }

            cordovaCompatibilityVersion = compatibility.optString("android", null);
            if (cordovaCompatibilityVersion == null) {
                throw new WebAppError(
                    WebAppError.Type.INVALID_ASSET_MANIFEST,
                    "Asset manifest does not have a cordovaCompatibilityVersion for android"
                );
            }

            JSONArray manifestEntries = json.optJSONArray("manifest");
            if (manifestEntries == null) {
                entries = Collections.emptyList();
                return;
            }

            List<Entry> parsedEntries = new ArrayList<>(manifestEntries.length());
            for (int i = 0; i < manifestEntries.length(); i++) {
                JSONObject entryJson = manifestEntries.getJSONObject(i);
                if (!"client".equals(entryJson.optString("where", null))) {
                    continue;
                }

                String filePath = entryJson.getString("path");
                String urlPath = entryJson.getString("url");
                String fileType = entryJson.getString("type");
                boolean cacheable = entryJson.getBoolean("cacheable");
                String hash = entryJson.optString("hash", null);
                String sourceMapFilePath = entryJson.optString("sourceMap", null);
                String sourceMapUrlPath = entryJson.optString("sourceMapUrl", null);

                parsedEntries.add(
                    new Entry(
                        filePath,
                        urlPath,
                        fileType,
                        cacheable,
                        hash,
                        sourceMapFilePath,
                        sourceMapUrlPath
                    )
                );
            }
            entries = Collections.unmodifiableList(parsedEntries);
        } catch (JSONException e) {
            throw new WebAppError(
                WebAppError.Type.INVALID_ASSET_MANIFEST,
                "Error parsing asset manifest",
                e
            );
        }
    }
}
