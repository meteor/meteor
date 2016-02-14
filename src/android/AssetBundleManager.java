package com.meteor.webapp;

import android.net.Uri;
import android.util.Log;

import org.apache.cordova.CordovaResourceApi;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.net.URLDecoder;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import okhttp3.Call;
import okhttp3.HttpUrl;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;

class AssetBundleManager {
    private static final String LOG_TAG = AssetBundleManager.class.getSimpleName();

    public interface Callback {
        public boolean shouldDownloadBundleForManifest(AssetManifest manifest);
        public void onFinishedDownloadingAssetBundle(AssetBundle assetBundle);
        public void onDownloadFailure(Throwable cause);
    }

    private Callback callback;

    private final CordovaResourceApi resourceApi;

    private final OkHttpClient httpClient;

    /** The directory used to store downloaded asset bundles */
    private final File versionsDirectory;
    private final Map<String, AssetBundle> downloadedAssetBundlesByVersion;

    /** The directory used while downloading a new asset bundle */
    private final File downloadDirectory;

    private AssetBundleDownloader assetBundleDownloader;

    /** The initial asset bundle included in the app bundle */
    public final AssetBundle initialAssetBundle;

    public AssetBundleManager(CordovaResourceApi resourceApi, AssetBundle initialAssetBundle, File versionsDirectory) {
        this.resourceApi = resourceApi;
        this.initialAssetBundle = initialAssetBundle;
        this.versionsDirectory = versionsDirectory;
        downloadDirectory = new File(versionsDirectory, "Downloading");

        downloadedAssetBundlesByVersion = new HashMap<String, AssetBundle>();
        loadDownloadedAssetBundles();

        httpClient = new OkHttpClient();
    }

    public void setCallback(Callback callback) {
        this.callback = callback;
    }

    synchronized public AssetBundle downloadedAssetBundleWithVersion(String version) {
        return downloadedAssetBundlesByVersion.get(version);
    }

    public void checkForUpdates(final HttpUrl baseUrl) {
        HttpUrl manifestUrl = baseUrl.resolve("manifest.json");

        Request request = new Request.Builder().url(manifestUrl).build();

        httpClient.newCall(request).enqueue(new okhttp3.Callback() {
            @Override
            public void onFailure(Call call, IOException e) {
                if (!call.isCanceled()) {
                    didFail(new DownloadFailureException("Error downloading asset manifest", e));
                }
            }

            @Override
            public void onResponse(Call call, Response response) {
                if (!response.isSuccessful()) {
                    didFail(new DownloadFailureException("Non-success status code " + response.code() + "for asset manifest"));
                    return;
                }

                byte[] manifestBytes;
                AssetManifest manifest;
                try {
                    manifestBytes = response.body().bytes();
                    manifest = new AssetManifest(new String(manifestBytes));
                } catch (JSONException e) {
                    didFail(new DownloadFailureException("Error parsing asset manifest", e));
                    return;
                } catch (IOException e) {
                    didFail(e);
                    return;
                }

                String version = manifest.version;

                Log.v(LOG_TAG, "Downloaded asset manifest for version: " + version);

                if (assetBundleDownloader != null && assetBundleDownloader.getAssetBundle().getVersion().equals(version)) {
                    Log.w(LOG_TAG, "Already downloading asset bundle version: " + version);
                    return;
                }

                // Give the callback a chance to decide whether the version should be downloaded
                if (callback != null && !callback.shouldDownloadBundleForManifest(manifest)) {
                    return;
                }

                if (assetBundleDownloader != null) {
                    assetBundleDownloader.cancel();
                }

                assetBundleDownloader = null;

                // Delete existing download directory if needed
                if (downloadDirectory.exists()) {
                    if (!IOUtils.deleteRecursively(downloadDirectory)) {
                        Log.w(LOG_TAG, "Could not delete download directory");
                    }
                }

                // Create download directory
                if (!downloadDirectory.mkdir()) {
                    didFail(new IOException("Could not create download directory"));
                    return;
                }

                // Copy downloaded asset manifest to file
                File manifestFile = new File(downloadDirectory, "program.json");
                try {
                    IOUtils.writeToFile(manifestBytes, manifestFile);
                } catch (IOException e) {
                    didFail(e);
                    return;
                }

                AssetBundle assetBundle = new AssetBundle(resourceApi, Uri.fromFile(downloadDirectory), manifest, initialAssetBundle);
                downloadAssetBundle(assetBundle, baseUrl);
            }
        });
    }

    public boolean isDownloading() {
        return assetBundleDownloader != null;
    }

    synchronized protected void downloadAssetBundle(final AssetBundle assetBundle, HttpUrl baseUrl) {
        Set<AssetBundle.Asset> missingAssets = new HashSet<AssetBundle.Asset>();

        for (AssetBundle.Asset asset : assetBundle.getOwnAssets()) {
            // Create containing directories for the asset if necessary
            File containingDirectory = asset.getFile().getParentFile();
            if (!containingDirectory.exists()) {
                if (!containingDirectory.mkdirs()) {
                    didFail(new IOException("Could not create containing directory: " + containingDirectory));
                    return;
                }
            }

            // If we find a cached asset, we copy it
            AssetBundle.Asset cachedAsset = cachedAssetForAsset(asset);
            if (cachedAsset != null) {
                try {
                    resourceApi.copyResource(cachedAsset.getFileUri(), asset.getFileUri());
                } catch (IOException e) {
                    didFail(e);
                    return;
                }
            } else {
                missingAssets.add(asset);
            }
        }

        // If all assets were cached, there is no need to start a download
        if (missingAssets.isEmpty()) {
            didFinishDownloadingAssetBundle(assetBundle);
            return;
        }

        assetBundleDownloader = new AssetBundleDownloader(assetBundle, baseUrl, missingAssets);
        assetBundleDownloader.setCallback(new AssetBundleDownloader.Callback() {
            @Override
            public void onFinished() {
                assetBundleDownloader = null;

                moveDownloadedAssetBundleIntoPlace(assetBundle);
                didFinishDownloadingAssetBundle(assetBundle);
            }

            @Override
            public void onFailure(Throwable cause) {
                didFail(cause);
            }
        });
        assetBundleDownloader.resume();
    }

    protected void didFinishDownloadingAssetBundle(AssetBundle assetBundle) {
        if (callback != null) {
            callback.onFinishedDownloadingAssetBundle(assetBundle);
        }
    }

    protected void didFail(Throwable cause) {
        if (callback != null) {
            callback.onDownloadFailure(cause);
        }
    }

    protected AssetBundle.Asset cachedAssetForAsset(AssetBundle.Asset asset) {
        for (AssetBundle assetBundle : downloadedAssetBundlesByVersion.values()) {
            AssetBundle.Asset cachedAsset = assetBundle.cachedAssetForUrlPath(asset.urlPath, asset.hash);
            if (cachedAsset != null) {
                return cachedAsset;
            }
        }
        return null;
    }

    /** Move the downloaded asset bundle to a new directory named after the version */
    synchronized protected void moveDownloadedAssetBundleIntoPlace(AssetBundle assetBundle) {
        final String version = assetBundle.getVersion();
        File versionDirectory = new File(versionsDirectory, version);
        downloadDirectory.renameTo(versionDirectory);
        assetBundle.didMoveToDirectoryAtUri(Uri.fromFile(versionDirectory));
        downloadedAssetBundlesByVersion.put(version, assetBundle);
    }

    synchronized void removeAllDownloadedAssetBundlesExceptForVersion(String versionToKeep) {
        Iterator<AssetBundle> iterator = downloadedAssetBundlesByVersion.values().iterator();
        while (iterator.hasNext()) {
            AssetBundle assetBundle = iterator.next();
            final String version = assetBundle.getVersion();

            if (version.equals(versionToKeep)) continue;

            File versionDirectory = new File(versionsDirectory, version);
            IOUtils.deleteRecursively(versionDirectory);
            iterator.remove();
        }
    }

    //region Loading

    private void loadDownloadedAssetBundles() {
        for (File file: versionsDirectory.listFiles()) {
            if (downloadDirectory.equals(file)) continue;

            if (file.isDirectory()) {
                AssetBundle assetBundle = new AssetBundle(resourceApi, Uri.fromFile(file), null, initialAssetBundle);
                downloadedAssetBundlesByVersion.put(assetBundle.getVersion(), assetBundle);
            }
        }
    }

    //endregion

    //region Testing support

    File getDownloadDirectory() {
        return downloadDirectory;
    }

    //endregion
}
