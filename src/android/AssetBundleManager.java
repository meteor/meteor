package com.meteor.webapp;

import android.net.Uri;
import android.util.Log;

import org.apache.cordova.CordovaResourceApi;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URLDecoder;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.HttpUrl;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okio.BufferedSink;
import okio.ByteString;
import okio.Okio;
import okio.Source;

class AssetBundleManager {
    private static final String LOG_TAG = AssetBundleManager.class.getSimpleName();

    public interface Delegate {
        public boolean shouldDownloadBundleForManifest(AssetManifest manifest);
        public void onFinishedDownloadingNewBundle(AssetBundle assetBundle);
    }

    static final Pattern runtimeConfigPattern = Pattern.compile("__meteor_runtime_config__ = JSON.parse\\(decodeURIComponent\\(\"([^\"]*)\"\\)\\)");

    private Delegate delegate;

    private final CordovaResourceApi resourceApi;

    private final OkHttpClient httpClient = new OkHttpClient();

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
    }

    CordovaResourceApi getResourceApi() {
        return resourceApi;
    }

    public void setDelegate(Delegate delegate) {
        this.delegate = delegate;
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

        httpClient.newCall(request).enqueue(new Callback() {
            @Override
            public void onFailure(Call call, IOException e) {
                Log.e(LOG_TAG, "Error downloading asset manifest", e);
            }

            @Override
            public void onResponse(Call call, Response response) throws IOException {
                if (!response.isSuccessful()) {
                    Log.e(LOG_TAG, "Non-success status code " + response.code() + "for asset manifest");
                    return;
                }

                byte[] bytes = response.body().bytes();

                AssetManifest manifest = null;
                try {
                    manifest = new AssetManifest(new ByteArrayInputStream(bytes));
                } catch (JSONException e) {
                    Log.e(LOG_TAG, "Error parsing asset manifest", e);
                    return;
                }

                String version = manifest.version;

                Log.v(LOG_TAG, "Downloaded asset manifest for version: " + version);

                if (assetBundleDownloader != null && assetBundleDownloader.getAssetBundle().getVersion().equals(version)) {
                    Log.w(LOG_TAG, "Already downloading asset bundle version: " + version);
                    return;
                }

                // Give the delegate a chance to decide whether the version should be downloaded
                if (delegate != null && !delegate.shouldDownloadBundleForManifest(manifest)) {
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
                    Log.e(LOG_TAG, "Could not create download directory");
                    return;
                }

                File manifestFile = new File(downloadDirectory, "program.json");
                IOUtils.writeToFile(bytes, manifestFile);

                AssetBundle assetBundle = new AssetBundle(AssetBundleManager.this, Uri.fromFile(downloadDirectory), manifest, initialAssetBundle);
                downloadAssetBundle(assetBundle, baseUrl);
            }
        });
    }

    public boolean isDownloading() {
        return assetBundleDownloader != null;
    }

    synchronized protected void downloadAssetBundle(AssetBundle assetBundle, HttpUrl baseUrl) {
        for (AssetBundle.Asset asset : assetBundle.getOwnAssets()) {
            File containingDirectory = asset.getFile().getParentFile();
            if (!containingDirectory.exists()) {
                if (!containingDirectory.mkdirs()) {
                    Log.e(LOG_TAG, "Could not create containing directory: " + containingDirectory);
                    return;
                }
            }
        }

        assetBundleDownloader = new AssetBundleDownloader(assetBundle, baseUrl);
        assetBundleDownloader.setListener(new AssetBundleDownloader.Listener() {
            @Override
            public void onDownloadFinished(AssetBundle assetBundle) {
                assetBundleDownloader = null;

                moveDownloadedAssetBundleIntoPlace(assetBundle);

                delegate.onFinishedDownloadingNewBundle(assetBundle);
            }
        });
        assetBundleDownloader.resume();
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

    synchronized public void removeVersionsDirectory() {
        if (versionsDirectory.exists()) {
            if (!IOUtils.deleteRecursively(versionsDirectory)) {
                Log.w(LOG_TAG, "Could not remove versions directory");
            }
        }
    }

    synchronized public void createVersionsDirectoryIfNeeded() {
        if (!versionsDirectory.exists()) {
            if (!versionsDirectory.mkdirs()) {
                Log.e(LOG_TAG, "Could not create versions directory");
                return;
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
            inputStream = resourceApi.openForRead(uri).inputStream;
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
            inputStream = resourceApi.openForRead(uri).inputStream;
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
}
