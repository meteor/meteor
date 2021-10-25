package com.meteor.webapp;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

final class AssetManifest {
    private static final String LOG_TAG = "MeteorWebApp";

    static final class Entry {
        final String filePath;
        final String urlPath;
        final String fileType;
        final boolean cacheable;
        final String hash;
        final String sourceMapFilePath;
        final String sourceMapUrlPath;

        Entry(String filePath, String urlPath, String fileType, boolean cacheable, String hash, String sourceMapFilePath, String sourceMapUrlPath) {
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

    public AssetManifest(String string) throws WebAppException {
        try {
            JSONObject json = new JSONObject(string);
            String format = json.optString("format", null);
            if (format != null && !format.equals("web-program-pre1")) {
                throw new WebAppException("The asset manifest format is incompatible: " + format);
            }

            try {
                version = json.getString("version");
            } catch (JSONException e) {
                throw new WebAppException("Asset manifest does not have a version", e);
            }

            try {
                JSONObject cordovaCompatibilityVersions = json.getJSONObject("cordovaCompatibilityVersions");
                cordovaCompatibilityVersion = cordovaCompatibilityVersions.getString("android");
            } catch (JSONException e) {
                throw new WebAppException("Asset manifest does not have a cordovaCompatibilityVersion", e);
            }

            JSONArray entriesJSON = json.getJSONArray("manifest");

            entries = new ArrayList<Entry>(entriesJSON.length());

            for (int i = 0; i < entriesJSON.length(); i++) {
                JSONObject entryJSON = entriesJSON.getJSONObject(i);

                if (!entryJSON.getString("where").equals("client")) continue;

                String filePath = entryJSON.getString("path");
                String urlPath = entryJSON.getString("url");

                String fileType = entryJSON.getString("type");
                boolean cacheable = entryJSON.getBoolean("cacheable");
                String hash = entryJSON.optString("hash", null);
                String sourceMapFilePath = entryJSON.optString("sourceMap", null);
                String sourceMapUrlPath = entryJSON.optString("sourceMapUrl", null);

                Entry entry = new Entry(filePath, urlPath, fileType, cacheable, hash, sourceMapFilePath, sourceMapUrlPath);
                entries.add(entry);
            }
        } catch (JSONException e) {
            throw new WebAppException("Error parsing asset manifest", e);
        }
    }
}
