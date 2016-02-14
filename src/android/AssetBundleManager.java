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
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import okhttp3.Call;
import okhttp3.HttpUrl;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;

class AssetBundleManager {
    private static final String LOG_TAG = AssetBundleManager.class.getSimpleName();

    static final Pattern runtimeConfigPattern = Pattern.compile("__meteor_runtime_config__ = JSON.parse\\(decodeURIComponent\\(\"([^\"]*)\"\\)\\)");

    public interface Callback {
        public boolean shouldDownloadBundleForManifest(AssetManifest manifest);
        public void onFinishedDownloadingNewBundle(AssetBundle assetBundle);
        public void onDownloadFailure(Throwable cause);
    }

    private Callback callback;

    private final CordovaResourceApi resourceApi;

    private final OkHttpClient httpClient;

    /** The directory used to store downloaded asset bundles */
    private File versionsDirectory;

    /** The directory used while downloading a new asset bundle */
    private File downloadDirectory;

    private AssetBundleDownloader assetBundleDownloader;

    /** The initial asset bundle included in the app bundle */
    public AssetBundle initialAssetBundle;

    public AssetBundleManager(CordovaResourceApi resourceApi, Uri applicationDirectoryUri, File versionsDirectory) {
        this.resourceApi = resourceApi;
        initialAssetBundle = loadAssetBundle(applicationDirectoryUri);
        this.versionsDirectory = versionsDirectory;

        downloadDirectory = new File(versionsDirectory, "Downloading");

        httpClient = new OkHttpClient();
    }

    public void setCallback(Callback callback) {
        this.callback = callback;
    }

    synchronized public AssetBundle downloadedAssetBundleWithVersion(String version) {
        File versionDirectory = new File(versionsDirectory, version);
        if (versionDirectory.exists()) {
            return loadAssetBundle(Uri.fromFile(versionDirectory));
        } else {
            return null;
        }
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
                    manifest = new AssetManifest(new ByteArrayInputStream(manifestBytes));
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

                AssetBundle assetBundle = new AssetBundle(AssetBundleManager.this, Uri.fromFile(downloadDirectory), manifest, initialAssetBundle);
                downloadAssetBundle(assetBundle, baseUrl);
            }
        });
    }

    public boolean isDownloading() {
        return assetBundleDownloader != null;
    }

    synchronized protected void downloadAssetBundle(final AssetBundle assetBundle, HttpUrl baseUrl) {
        for (AssetBundle.Asset asset : assetBundle.getOwnAssets()) {
            File containingDirectory = asset.getFile().getParentFile();
            if (!containingDirectory.exists()) {
                if (!containingDirectory.mkdirs()) {
                    didFail(new IOException("Could not create containing directory: " + containingDirectory));
                    return;
                }
            }
        }

        assetBundleDownloader = new AssetBundleDownloader(assetBundle, baseUrl);
        assetBundleDownloader.setCallback(new AssetBundleDownloader.Callback() {
            @Override
            public void onFinished() {
                assetBundleDownloader = null;

                moveDownloadedAssetBundleIntoPlace(assetBundle);

                if (callback != null) {
                    callback.onFinishedDownloadingNewBundle(assetBundle);
                }
            }

            @Override
            public void onFailure(Throwable cause) {
                didFail(cause);
            }
        });
        assetBundleDownloader.resume();
    }

    protected void didFail(Throwable cause) {
        if (callback != null) {
            callback.onDownloadFailure(cause);
        }
    }

    /** Move the downloaded asset bundle to a new directory named after the version */
    synchronized protected void moveDownloadedAssetBundleIntoPlace(AssetBundle assetBundle) {
        File versionDirectory = new File(versionsDirectory, assetBundle.getVersion());

        downloadDirectory.renameTo(versionDirectory);

        assetBundle.didMoveToDirectoryAtUri(Uri.fromFile(versionDirectory));
    }

    synchronized void removeAllDownloadedAssetBundlesExceptForVersion(String versionToKeep) {
        for (File file : versionsDirectory.listFiles()) {
            if (downloadDirectory.equals(file)) continue;

            if (!file.getName().equals(versionToKeep)) {
                IOUtils.deleteRecursively(file);
            }
        }
    }

    //region Loading

    protected AssetBundle loadAssetBundle(Uri directoryUri) {
        Uri manifestUri = Uri.withAppendedPath(directoryUri, "program.json");
        AssetManifest assetManifest = loadAssetManifest(manifestUri);
        return new AssetBundle(this, directoryUri, assetManifest, initialAssetBundle);
    }

    protected AssetManifest loadAssetManifest(Uri uri) {
        InputStream inputStream = null;
        try {
            inputStream = resourceApi.openForRead(uri, true).inputStream;
            return new AssetManifest(inputStream);
        } catch (IOException e) {
            throw new RuntimeException("Error loading asset manifest", e);
        } catch (JSONException e) {
            throw new RuntimeException("Error parsing asset manifest", e);
        } finally {
            if (inputStream != null) {
                try {
                    inputStream.close();
                } catch (IOException e) {
                }
            }
        }
    }

    JSONObject loadRuntimeConfig(Uri uri) {
        InputStream inputStream = null;
        try {
            inputStream = resourceApi.openForRead(uri, true).inputStream;
            String indexFileString = IOUtils.stringFromInputStream(inputStream);
            Matcher matcher = runtimeConfigPattern.matcher(indexFileString);
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
        } finally {
            if (inputStream != null) {
                try {
                    inputStream.close();
                } catch (IOException e) {
                }
            }
        }
    }

    //endregion

    //region Testing support

    CordovaResourceApi getResourceApi() {
        return resourceApi;
    }

    File getDownloadDirectory() {
        return downloadDirectory;
    }

    //endregion
}
