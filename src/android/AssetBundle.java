package com.meteor.webapp;

import android.net.Uri;
import android.util.Log;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.util.HashMap;
import java.util.Map;

import okhttp3.HttpUrl;

class AssetBundle {
    private static final String LOG_TAG = AssetBundle.class.getSimpleName();

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
            return Uri.withAppendedPath(AssetBundle.this.directoryUri, filePath);
        }

        public File getFile() {
            return manager.getResourceApi().mapUriToFile(getFileUri());
        }

        @Override
        public String toString() {
            return urlPath;
        }
    }

    private final AssetBundleManager manager;

    private final String version;

    private final AssetBundle parentAssetBundle;

    private Uri directoryUri;
    private Map<String, Asset> ownAssetsByURLPath;
    private Asset indexFile;

    private JSONObject runtimeConfig;
    private String appId;
    private HttpUrl rootUrl;

    public AssetBundle(AssetBundleManager manager, Uri directoryUri, AssetManifest manifest, AssetBundle parentAssetBundle) {
        this.manager = manager;
        this.directoryUri = directoryUri;
        this.parentAssetBundle = parentAssetBundle;

        version = manifest.version;

        ownAssetsByURLPath = new HashMap<String, Asset>();
        for (AssetManifest.Entry entry : manifest.entries) {
            // Remove query parameters from url path
            String urlPath = Uri.parse(entry.urlPath).getPath();

            if (parentAssetBundle == null || parentAssetBundle.cachedAssetForUrlPath(urlPath, entry.hash) == null) {
                Asset asset = new Asset(entry.filePath, urlPath, entry.fileType, entry.cacheable, entry.hash, entry.sourceMapUrlPath);
                addAsset(asset);
            }

            if (entry.sourceMapFilePath != null && entry.sourceMapUrlPath != null) {
                if (parentAssetBundle == null || parentAssetBundle.cachedAssetForUrlPath(entry.sourceMapUrlPath, null) == null) {
                    Asset sourceMap = new Asset(entry.sourceMapFilePath, entry.sourceMapUrlPath, "json", true, null, null);
                    addAsset(sourceMap);
                }
            }
        }

        Asset indexFile = new Asset("index.html", "/", "html", false, null, null);
        addAsset(indexFile);
        this.indexFile = indexFile;
    }

    protected void addAsset(Asset asset) {
        ownAssetsByURLPath.put(asset.urlPath, asset);
    }

    public Iterable<Asset> getOwnAssets() {
        return ownAssetsByURLPath.values();
    }

    public Asset assetForUrlPath(String urlPath) {
        Asset asset = ownAssetsByURLPath.get(urlPath);
        if (asset == null && parentAssetBundle != null) {
            asset = parentAssetBundle.assetForUrlPath(urlPath);
        }
        return asset;
    }

    public Asset cachedAssetForUrlPath(String urlPath, String hash) {
        Asset asset = ownAssetsByURLPath.get(urlPath);

        if (asset == null) return null;

        // If the asset is not cacheable, we require a matching hash
        if ((asset.cacheable && hash == null) || (asset.hash != null && asset.hash.equals(hash))) {
            return asset;
        }

        return null;
    }

    public String getVersion() {
        return version;
    }

    public Asset getIndexFile() {
        return indexFile;
    }

    public JSONObject getRuntimeConfig() {
        if (runtimeConfig == null) {
            runtimeConfig = manager.loadRuntimeConfig(getIndexFile().getFileUri());
        }
        return runtimeConfig;
    }

    public String getAppId() {
        if (appId == null) {
            JSONObject runtimeConfig = getRuntimeConfig();
            if (runtimeConfig != null) {
                try {
                    appId = runtimeConfig.getString("APP_ID");
                } catch (JSONException e) {
                    Log.w(LOG_TAG, "Error reading APP_ID from runtime config", e);
                }
            }
        }
        return appId;
    }

    public HttpUrl getRootUrl() {
        if (rootUrl == null) {
            JSONObject runtimeConfig = getRuntimeConfig();
            if (runtimeConfig != null) {
                try {
                    rootUrl = HttpUrl.parse(runtimeConfig.getString("ROOT_URL"));
                } catch (JSONException e) {
                    Log.w(LOG_TAG, "Error reading ROOT_URL from runtime config", e);
                }
            }
        }
        return rootUrl;
    }

    void didMoveToDirectoryAtUri(Uri directoryUri) {
        this.directoryUri = directoryUri;
    }
}
