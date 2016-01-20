package com.meteor.webapp;

import android.net.Uri;

import java.util.HashMap;
import java.util.Map;

class AssetBundle {
    final class Asset {
        final String filePath;
        final String urlPath;
        final String fileType;
        final boolean cacheable;
        final String hash;
        final String sourceMapUrlPath;

        Asset(String filePath, String urlPath, String fileType, boolean cacheable, String hash, String sourceMapUrlPath) {
            this.filePath = filePath;
            this.urlPath = urlPath;
            this.fileType = fileType;
            this.cacheable = cacheable;
            this.hash = hash;
            this.sourceMapUrlPath = sourceMapUrlPath;
        }

        public Uri getFileUri() {
            return Uri.withAppendedPath(AssetBundle.this.rootUri, filePath);
        }
    }

    private String version;
    private Uri rootUri;
    private Map<String, Asset> assetsByURLPath;
    private Asset indexFile;

    public AssetBundle(Uri rootUri, AssetManifest manifest) {
        this.rootUri = rootUri;
        version = manifest.version;

        assetsByURLPath = new HashMap<String, Asset>();
        for (AssetManifest.Entry entry : manifest.entries) {
            // Remove query parameters from url path
            String urlPath = Uri.parse(entry.urlPath).getPath();

            Asset asset = new Asset(entry.filePath, urlPath, entry.fileType, entry.cacheable, entry.hash, entry.sourceMapUrlPath);
            addAsset(asset);

            if (entry.sourceMapFilePath != null && entry.sourceMapUrlPath != null) {
              Asset sourceMap = new Asset(entry.sourceMapFilePath, entry.sourceMapUrlPath, "json", true, null, null);
              addAsset(sourceMap);
            }
        }

        Asset indexFile = new Asset("index.html", "/", "html", false, null, null);
        addAsset(indexFile);
        this.indexFile = indexFile;
    }

    protected void addAsset(Asset asset) {
        assetsByURLPath.put(asset.urlPath, asset);
    }

    public Asset assetForUrlPath(String urlPath) {
        return assetsByURLPath.get(urlPath);
    }

    public String getVersion() {
        return version;
    }

    public Asset getIndexFile() {
        return indexFile;
    }
}
