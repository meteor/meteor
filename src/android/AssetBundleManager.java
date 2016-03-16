package com.meteor.webapp;

import android.net.Uri;
import android.util.Log;

import org.apache.cordova.CordovaResourceApi;
import org.json.JSONException;

import java.io.File;
import java.io.IOException;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Map;
import java.util.Set;

import okhttp3.Call;
import okhttp3.HttpUrl;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;

class AssetBundleManager {
    private static final String LOG_TAG = "MeteorWebApp";

    public interface Callback {
        public boolean shouldDownloadBundleForManifest(AssetManifest manifest);
        public void onFinishedDownloadingAssetBundle(AssetBundle assetBundle);
        public void onError(Throwable cause);
    }

    private Callback callback;

    private final CordovaResourceApi resourceApi;
    private final WebAppConfiguration webAppConfiguration;

    private final OkHttpClient httpClient;

    /** The directory used to store downloaded asset bundles */
    private final File versionsDirectory;
    private final Map<String, AssetBundle> downloadedAssetBundlesByVersion;

    /** The directory used while downloading a new asset bundle */
    private final File downloadDirectory;

    private final File partialDownloadDirectory;
    private AssetBundle partiallyDownloadedAssetBundle;

    private AssetBundleDownloader assetBundleDownloader;

    /** The initial asset bundle included in the app bundle */
    public final AssetBundle initialAssetBundle;

    public AssetBundleManager(CordovaResourceApi resourceApi, WebAppConfiguration webAppConfiguration, AssetBundle initialAssetBundle, File versionsDirectory) throws WebAppException {
        this.resourceApi = resourceApi;
        this.webAppConfiguration = webAppConfiguration;
        this.initialAssetBundle = initialAssetBundle;
        this.versionsDirectory = versionsDirectory;
        downloadDirectory = new File(versionsDirectory, "Downloading");
        partialDownloadDirectory = new File(versionsDirectory, "PartialDownload");

        downloadedAssetBundlesByVersion = new HashMap<String, AssetBundle>();
        loadDownloadedAssetBundles();

        httpClient = new OkHttpClient();
    }

    private void loadDownloadedAssetBundles() throws WebAppException {
        for (File file: versionsDirectory.listFiles()) {
            if (downloadDirectory.equals(file)) continue;
            if (partialDownloadDirectory.equals(file)) continue;

            if (file.isDirectory()) {
                AssetBundle assetBundle = new AssetBundle(resourceApi, Uri.fromFile(file), null, initialAssetBundle);
                downloadedAssetBundlesByVersion.put(assetBundle.getVersion(), assetBundle);
            }
        }
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
                    didFail(new WebAppException("Error downloading asset manifest", e));
                }
            }

            @Override
            public void onResponse(Call call, Response response) {
                if (!response.isSuccessful()) {
                    didFail(new WebAppException("Non-success status code " + response.code() + "for asset manifest"));
                    return;
                }

                byte[] manifestBytes;
                AssetManifest manifest;
                try {
                    manifestBytes = response.body().bytes();
                    manifest = new AssetManifest(new String(manifestBytes));
                } catch (WebAppException e) {
                    didFail(e);
                    return;
                } catch (IOException e) {
                    didFail(e);
                    return;
                }

                final String version = manifest.version;

                Log.d(LOG_TAG, "Downloaded asset manifest for version: " + version);

                if (assetBundleDownloader != null && assetBundleDownloader.getAssetBundle().getVersion().equals(version)) {
                    Log.w(LOG_TAG, "Already downloading asset bundle version: " + version);
                    return;
                }

                // Give the callback a chance to decide whether the version should be downloaded
                if (callback != null && !callback.shouldDownloadBundleForManifest(manifest)) {
                    return;
                }

                // Cancel in progress download if there is one
                if (assetBundleDownloader != null) {
                    assetBundleDownloader.cancel();
                }
                assetBundleDownloader = null;

                // There is no need to redownload the initial version
                if (initialAssetBundle.getVersion().equals(version)) {
                    didFinishDownloadingAssetBundle(initialAssetBundle);
                    return;
                }

                // If there is a previously downloaded asset bundle with the requested
                // version, use that
                AssetBundle downloadedAssetBundle = downloadedAssetBundleWithVersion(version);
                if (downloadedAssetBundle != null) {
                    didFinishDownloadingAssetBundle(downloadedAssetBundle);
                    return;
                }

                // Else, get ready to download the new asset bundle

                moveExistingDownloadDirectoryIfNeeded();

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

                AssetBundle assetBundle = null;
                try {
                    assetBundle = new AssetBundle(resourceApi, Uri.fromFile(downloadDirectory), manifest, initialAssetBundle);
                } catch (WebAppException e) {
                    didFail(e);
                    return;
                }
                downloadAssetBundle(assetBundle, baseUrl);
            }
        });
    }

    /** If there is an existing Downloading directory, move it
     * to PartialDownload and load the partiallyDownloadedAssetBundle so we
     * don't unnecessarily redownload assets
     */
    private void moveExistingDownloadDirectoryIfNeeded() {
        if (downloadDirectory.exists()) {
            if (partialDownloadDirectory.exists()) {
                if (!IOUtils.deleteRecursively(partialDownloadDirectory)) {
                    Log.w(LOG_TAG, "Could not delete partial download directory");
                }
            }

            partiallyDownloadedAssetBundle = null;

            if (!downloadDirectory.renameTo(partialDownloadDirectory)) {
                Log.w(LOG_TAG, "Could not rename existing download directory");
                return;
            }

            try {
                partiallyDownloadedAssetBundle = new AssetBundle(resourceApi, Uri.fromFile(partialDownloadDirectory), initialAssetBundle);
            } catch (Exception e) {
                Log.w(LOG_TAG, "Could not load partially downloaded asset bundle", e);
            }
        }
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

        assetBundleDownloader = new AssetBundleDownloader(webAppConfiguration, assetBundle, baseUrl, missingAssets);
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
        assetBundleDownloader = null;

        if (callback != null) {
            callback.onFinishedDownloadingAssetBundle(assetBundle);
        }
    }

    protected void didFail(Throwable cause) {
        assetBundleDownloader = null;

        if (callback != null) {
            callback.onError(cause);
        }
    }

    protected AssetBundle.Asset cachedAssetForAsset(AssetBundle.Asset asset) {
        for (AssetBundle assetBundle : downloadedAssetBundlesByVersion.values()) {
            AssetBundle.Asset cachedAsset = assetBundle.cachedAssetForUrlPath(asset.urlPath, asset.hash);
            if (cachedAsset != null) {
                return cachedAsset;
            }
        }

        if (partiallyDownloadedAssetBundle != null) {
            AssetBundle.Asset cachedAsset = partiallyDownloadedAssetBundle.cachedAssetForUrlPath(asset.urlPath, asset.hash);
            // Make sure the asset has been downloaded
            if (cachedAsset != null && cachedAsset.getFile().exists()) {
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

    //region Testing support

    File getDownloadDirectory() {
        return downloadDirectory;
    }

    //endregion
}
