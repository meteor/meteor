package com.meteor.webapp;

import android.util.Log;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;

final class AssetManifest {
    private static final String LOG_TAG = AssetManifest.class.getSimpleName();

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
    final List<Entry> entries;

    public AssetManifest(InputStream inputStream) throws IOException, JSONException {
        this(new JSONObject(IOUtils.stringFromInputStream(inputStream)));
    }

    public AssetManifest(JSONObject json) throws JSONException {
        String format = json.optString("format");
        if (format != null && !format.equals("web-program-pre1")) {
            throw new JSONException("The asset manifest format is incompatible: " + format);
        }

        version = json.getString("version");

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
    }
}