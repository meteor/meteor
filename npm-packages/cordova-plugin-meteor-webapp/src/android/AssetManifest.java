package com.meteor.webapp;

import android.net.Uri;

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

                for (String path : new String[] { filePath, sourceMapFilePath }) {
                    if (path != null && !isValidFilePath(path)) {
                        throw new WebAppException("Asset manifest contains an invalid file path: " + path);
                    }
                }

                Entry entry = new Entry(filePath, urlPath, fileType, cacheable, hash, sourceMapFilePath, sourceMapUrlPath);
                entries.add(entry);
            }
        } catch (JSONException e) {
            throw new WebAppException("Error parsing asset manifest", e);
        }
    }

    /** Rejects empty, absolute, or traversal paths, including encoded segments. */
    static boolean isValidFilePath(String filePath) {
        for (String path : new String[] { filePath, Uri.decode(filePath) }) {
            if (path.isEmpty() || path.startsWith("/")) return false;
            for (String segment : path.split("/", -1)) {
                if (segment.equals("..")) return false;
            }
        }
        return true;
    }

    /** Requires one safe directory name, including after percent-decoding. */
    static boolean isValidVersion(String version) {
        for (String name : new String[] { version, Uri.decode(version) }) {
            if (name.isEmpty() || name.equals(".") || name.equals("..") || name.contains("/")) return false;
        }
        return true;
    }
}
