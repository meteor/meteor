package com.meteor.webapp;

import android.net.Uri;
import android.util.Log;

import org.apache.cordova.CordovaResourceApi;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.net.URLDecoder;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

class AssetBundle {
    private static final String LOG_TAG = "MeteorWebApp";

    static final Pattern runtimeConfigPattern = Pattern.compile("__meteor_runtime_config__ = JSON.parse\\(decodeURIComponent\\(\"([^\"]*)\"\\)\\)");

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
            return resourceApi.mapUriToFile(getFileUri());
        }

        @Override
        public String toString() {
            return urlPath;
        }
    }

    private final CordovaResourceApi resourceApi;
    private Uri directoryUri;
    private final AssetBundle parentAssetBundle;

    private final String version;
    private final String cordovaCompatibilityVersion;

    private Map<String, Asset> ownAssetsByURLPath;
    private Asset indexFile;

    private JSONObject runtimeConfig;
    private String appId;
    private String rootUrlString;

    public AssetBundle(CordovaResourceApi resourceApi, Uri directoryUri) throws WebAppException {
        this(resourceApi, directoryUri, null, null);
    }

    public AssetBundle(CordovaResourceApi resourceApi, Uri directoryUri, AssetBundle parentAssetBundle) throws WebAppException {
        this(resourceApi, directoryUri, null, parentAssetBundle);
    }

    public AssetBundle(CordovaResourceApi resourceApi, Uri directoryUri, AssetManifest manifest, AssetBundle parentAssetBundle) throws WebAppException {
        this.resourceApi = resourceApi;
        this.directoryUri = directoryUri;
        this.parentAssetBundle = parentAssetBundle;

        if (manifest == null) {
            manifest = loadAssetManifest();
        }

        version = manifest.version;
        cordovaCompatibilityVersion = manifest.cordovaCompatibilityVersion;

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

    public Set<Asset> getOwnAssets() {
        return new HashSet<Asset>(ownAssetsByURLPath.values());
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

    public String getCordovaCompatibilityVersion() {
        return cordovaCompatibilityVersion;
    }

    public Asset getIndexFile() {
        return indexFile;
    }

    public JSONObject getRuntimeConfig() {
        if (runtimeConfig == null) {
            runtimeConfig = loadRuntimeConfig(getIndexFile().getFileUri());
        }
        return runtimeConfig;
    }

    public String getAppId() {
        if (appId == null) {
            JSONObject runtimeConfig = getRuntimeConfig();
            if (runtimeConfig != null) {
                try {
                    appId = runtimeConfig.getString("appId");
                } catch (JSONException e) {
                    Log.w(LOG_TAG, "Error reading APP_ID from runtime config", e);
                }
            }
        }
        return appId;
    }

    public String getRootUrlString() {
        if (rootUrlString == null) {
            JSONObject runtimeConfig = getRuntimeConfig();
            if (runtimeConfig != null) {
                try {
                    rootUrlString = runtimeConfig.getString("ROOT_URL");
                } catch (JSONException e) {
                    Log.w(LOG_TAG, "Error reading ROOT_URL from runtime config", e);
                }
            }
        }
        return rootUrlString;
    }

    void didMoveToDirectoryAtUri(Uri directoryUri) {
        this.directoryUri = directoryUri;
    }

    private AssetManifest loadAssetManifest() throws WebAppException {
        Uri manifestUri = Uri.withAppendedPath(directoryUri, "program.json");
        try {
            String string = stringFromUri(manifestUri);
            return new AssetManifest(string);
        } catch (IOException e) {
            throw new WebAppException("Error loading asset manifest", e);
        }
    }

    JSONObject loadRuntimeConfig(Uri uri) {
        try {
            String string = stringFromUri(uri);
            Matcher matcher = runtimeConfigPattern.matcher(string);
            if (!matcher.find()) {
                Log.e(LOG_TAG, "Could not find runtime config in index file");
                return null;
            }
            String runtimeConfigString = URLDecoder.decode(matcher.group(1), "UTF-8");
            return new JSONObject(runtimeConfigString);
        } catch (IOException e) {
            Log.e(LOG_TAG, "Error loading index file", e);
            return null;
        } catch (IllegalStateException e) {
            Log.e(LOG_TAG, "Could not find runtime config in index file", e);
            return null;
        } catch (JSONException e) {
            Log.e(LOG_TAG, "Error parsing runtime config", e);
            return null;
        }
    }

    private String stringFromUri(Uri uri) throws IOException {
        InputStream inputStream = null;
        try {
            inputStream = resourceApi.openForRead(uri, true).inputStream;
            return IOUtils.stringFromInputStream(inputStream);
        } finally {
            if (inputStream != null) {
                try {
                    inputStream.close();
                } catch (IOException e) {
                }
            }
        }
    }
}
