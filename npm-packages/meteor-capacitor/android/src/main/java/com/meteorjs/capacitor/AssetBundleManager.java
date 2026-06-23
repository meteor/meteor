/*
 * Vendored from https://github.com/banjerluke/capacitor-meteor-webapp
 * Copyright 2025 Luke Abbott. MIT license. See LICENSES/banjerluke-capacitor-meteor-webapp.txt.
 */

package com.meteorjs.capacitor;

import android.content.Context;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

final class AssetBundleManager {

    interface Callback {
        boolean shouldDownloadBundleForManifest(AssetManifest manifest);
        void onFinishedDownloadingAssetBundle(AssetBundle assetBundle);
        void onError(Throwable cause);
    }

    private final Context context;
    private final WebAppConfiguration configuration;
    private final File versionsDirectory;
    private final File downloadDirectory;
    private final File partialDownloadDirectory;

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final Map<String, AssetBundle> downloadedAssetBundlesByVersion = new ConcurrentHashMap<>();

    private Callback callback;
    private AssetBundleDownloader assetBundleDownloader;
    private AssetBundle partiallyDownloadedAssetBundle;

    final AssetBundle initialAssetBundle;

    AssetBundleManager(
        Context context,
        WebAppConfiguration configuration,
        File versionsDirectory,
        AssetBundle initialAssetBundle
    ) throws WebAppError {
        this.context = context.getApplicationContext();
        this.configuration = configuration;
        this.versionsDirectory = versionsDirectory;
        this.initialAssetBundle = initialAssetBundle;

        this.downloadDirectory = new File(versionsDirectory, "Downloading");
        this.partialDownloadDirectory = new File(versionsDirectory, "PartialDownload");

        loadDownloadedAssetBundles();
    }

    void setCallback(Callback callback) {
        this.callback = callback;
    }

    AssetBundle downloadedAssetBundleWithVersion(String version) {
        return downloadedAssetBundlesByVersion.get(version);
    }

    boolean isDownloading() {
        return assetBundleDownloader != null;
    }

    void checkForUpdates(URL baseUrl) {
        executor.execute(() -> checkForUpdatesInternal(baseUrl));
    }

    void removeAllDownloadedAssetBundlesExceptForVersion(String versionToKeep) {
        executor.execute(() -> {
            for (Map.Entry<String, AssetBundle> entry : downloadedAssetBundlesByVersion.entrySet()) {
                String version = entry.getKey();
                if (version.equals(versionToKeep)) {
                    continue;
                }

                File versionDirectory = new File(versionsDirectory, version);
                if (!FileOps.deleteRecursively(versionDirectory)) {
                    // best effort cleanup
                }
                downloadedAssetBundlesByVersion.remove(version);
            }
        });
    }

    void shutdown() {
        executor.execute(() -> {
            if (assetBundleDownloader != null) {
                assetBundleDownloader.cancel();
                assetBundleDownloader = null;
            }
        });
        executor.shutdownNow();
    }

    private void checkForUpdatesInternal(URL baseUrl) {
        final byte[] manifestBytes;
        final AssetManifest manifest;
        try {
            URL manifestUrl = new URL(baseUrl, "manifest.json");
            manifestBytes = downloadManifest(manifestUrl);
            manifest = new AssetManifest(new String(manifestBytes, StandardCharsets.UTF_8));
        } catch (Throwable cause) {
            notifyError(cause);
            return;
        }

        String version = manifest.version;

        if (assetBundleDownloader != null
            && assetBundleDownloader.getAssetBundle().getVersion().equals(version)) {
            return;
        }

        if (callback != null && !callback.shouldDownloadBundleForManifest(manifest)) {
            return;
        }

        if (assetBundleDownloader != null) {
            assetBundleDownloader.cancel();
            assetBundleDownloader = null;
        }

        if (initialAssetBundle.getVersion().equals(version)) {
            notifyFinished(initialAssetBundle);
            return;
        }

        AssetBundle existingBundle = downloadedAssetBundlesByVersion.get(version);
        if (existingBundle != null) {
            notifyFinished(existingBundle);
            return;
        }

        try {
            if (!moveExistingDownloadDirectoryIfNeeded()) {
                return;
            }
            if (!downloadDirectory.exists() && !downloadDirectory.mkdirs() && !downloadDirectory.isDirectory()) {
                throw new WebAppError(
                    WebAppError.Type.FILE_SYSTEM_ERROR,
                    "Could not create download directory: " + downloadDirectory.getAbsolutePath()
                );
            }

            File manifestFile = new File(downloadDirectory, "program.json");
            try (InputStream manifestInput = new ByteArrayInputStream(manifestBytes)) {
                FileOps.copy(manifestInput, manifestFile);
            }

            AssetBundle downloadingBundle = AssetBundle.fromDirectory(downloadDirectory, initialAssetBundle);
            downloadAssetBundle(downloadingBundle, baseUrl);
        } catch (Throwable cause) {
            notifyError(cause);
        }
    }

    private void downloadAssetBundle(AssetBundle assetBundle, URL baseUrl) {
        Set<Asset> missingAssets = new HashSet<>();

        for (Asset asset : assetBundle.getOwnAssets()) {
            if (assetBundle.assetExistsInBundle("/__cordova" + asset.urlPath)) {
                continue;
            }

            File destination = asset.getFile();
            if (destination == null) {
                notifyError(
                    new WebAppError(
                        WebAppError.Type.FILE_SYSTEM_ERROR,
                        "Asset has no destination file: " + asset.urlPath
                    )
                );
                return;
            }

            try {
                FileOps.ensureParentDirectory(destination);
            } catch (IOException e) {
                notifyError(
                    new WebAppError(
                        WebAppError.Type.FILE_SYSTEM_ERROR,
                        "Could not create containing directory for asset: " + asset.urlPath,
                        e
                    )
                );
                return;
            }

            Asset cachedAsset = cachedAssetForAsset(asset);
            if (cachedAsset != null) {
                File cachedFile = cachedAsset.getFile();
                if (cachedFile == null) {
                    missingAssets.add(asset);
                    continue;
                }

                try {
                    FileOps.copy(cachedFile, destination);
                } catch (IOException e) {
                    if (isSourceMapAsset(asset)) {
                        continue;
                    }
                    notifyError(
                        new WebAppError(
                            WebAppError.Type.FILE_SYSTEM_ERROR,
                            "Could not copy cached asset " + asset.urlPath,
                            e
                        )
                    );
                    return;
                }
            } else {
                missingAssets.add(asset);
            }
        }

        if (missingAssets.isEmpty()) {
            try {
                moveDownloadedAssetBundleIntoPlace(assetBundle);
                notifyFinished(assetBundle);
            } catch (Throwable cause) {
                notifyError(cause);
            }
            return;
        }

        assetBundleDownloader = new AssetBundleDownloader(
            context,
            configuration,
            assetBundle,
            baseUrl,
            missingAssets,
            new AssetBundleDownloader.Callback() {
                @Override
                public void onFinished() {
                    executor.execute(() -> {
                        try {
                            moveDownloadedAssetBundleIntoPlace(assetBundle);
                            notifyFinished(assetBundle);
                        } catch (Throwable cause) {
                            notifyError(cause);
                        } finally {
                            assetBundleDownloader = null;
                        }
                    });
                }

                @Override
                public void onFailure(Throwable cause) {
                    executor.execute(() -> {
                        assetBundleDownloader = null;
                        notifyError(cause);
                    });
                }
            }
        );
        assetBundleDownloader.resume();
    }

    private boolean moveExistingDownloadDirectoryIfNeeded() {
        if (!downloadDirectory.exists()) {
            return true;
        }

        if (partialDownloadDirectory.exists() && !FileOps.deleteRecursively(partialDownloadDirectory)) {
            notifyError(
                new WebAppError(
                    WebAppError.Type.FILE_SYSTEM_ERROR,
                    "Could not delete previous PartialDownload directory"
                )
            );
            return false;
        }

        partiallyDownloadedAssetBundle = null;

        try {
            FileOps.moveAtomicallyOrCopyDelete(downloadDirectory, partialDownloadDirectory);
            partiallyDownloadedAssetBundle = AssetBundle.fromDirectory(partialDownloadDirectory, initialAssetBundle);
            return true;
        } catch (Throwable cause) {
            notifyError(
                new WebAppError(
                    WebAppError.Type.FILE_SYSTEM_ERROR,
                    "Could not move Downloading directory to PartialDownload",
                    cause
                )
            );
            return false;
        }
    }

    private void moveDownloadedAssetBundleIntoPlace(AssetBundle assetBundle) throws IOException {
        File versionDirectory = new File(versionsDirectory, assetBundle.getVersion());

        if (versionDirectory.exists() && !FileOps.deleteRecursively(versionDirectory)) {
            throw new IOException("Failed to replace existing version directory: " + versionDirectory.getAbsolutePath());
        }

        FileOps.moveAtomicallyOrCopyDelete(downloadDirectory, versionDirectory);
        assetBundle.didMoveToDirectoryAtUrl(versionDirectory);
        downloadedAssetBundlesByVersion.put(assetBundle.getVersion(), assetBundle);
    }

    private Asset cachedAssetForAsset(Asset asset) {
        for (AssetBundle bundle : downloadedAssetBundlesByVersion.values()) {
            Asset cached = bundle.cachedAssetForUrlPath(asset.urlPath, asset.hash);
            if (cached != null) {
                return cached;
            }
        }

        if (partiallyDownloadedAssetBundle != null) {
            Asset cached = partiallyDownloadedAssetBundle.cachedAssetForUrlPath(asset.urlPath, asset.hash);
            if (cached != null) {
                File cachedFile = cached.getFile();
                if (cachedFile != null && cachedFile.exists()) {
                    return cached;
                }
            }
        }

        return null;
    }

    private void loadDownloadedAssetBundles() {
        if (!versionsDirectory.exists()) {
            return;
        }

        File[] files = versionsDirectory.listFiles();
        if (files == null) {
            return;
        }

        for (File file : files) {
            if (!file.isDirectory()) {
                continue;
            }
            if (file.equals(downloadDirectory) || file.equals(partialDownloadDirectory)) {
                continue;
            }

            try {
                AssetBundle bundle = AssetBundle.fromDirectory(file, initialAssetBundle);
                downloadedAssetBundlesByVersion.put(bundle.getVersion(), bundle);
            } catch (Throwable ignored) {
                // skip corrupted bundle directories and continue loading remaining versions
            }
        }
    }

    private byte[] downloadManifest(URL manifestUrl) throws IOException, WebAppError {
        HttpURLConnection connection = (HttpURLConnection) manifestUrl.openConnection();
        connection.setRequestMethod("GET");
        connection.setUseCaches(true);
        connection.setConnectTimeout(10000);
        connection.setReadTimeout(20000);

        int statusCode = connection.getResponseCode();
        if (statusCode < 200 || statusCode >= 300) {
            throw new WebAppError(
                WebAppError.Type.DOWNLOAD_FAILURE,
                "Non-success status code " + statusCode + " for asset manifest"
            );
        }

        try (InputStream inputStream = connection.getInputStream()) {
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            byte[] buffer = new byte[4096];
            int read;
            while ((read = inputStream.read(buffer)) != -1) {
                output.write(buffer, 0, read);
            }
            return output.toByteArray();
        } finally {
            connection.disconnect();
        }
    }

    private void notifyFinished(AssetBundle assetBundle) {
        if (callback != null) {
            callback.onFinishedDownloadingAssetBundle(assetBundle);
        }
    }

    private void notifyError(Throwable cause) {
        if (callback != null) {
            callback.onError(cause);
        }
    }

    private static boolean isSourceMapAsset(Asset asset) {
        return asset.urlPath.endsWith(".map") || asset.filePath.endsWith(".map");
    }
}
