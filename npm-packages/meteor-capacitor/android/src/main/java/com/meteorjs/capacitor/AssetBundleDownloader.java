/*
 * Vendored from https://github.com/banjerluke/capacitor-meteor-webapp
 * Copyright 2025 Luke Abbott. MIT license. See LICENSES/banjerluke-capacitor-meteor-webapp.txt.
 */

package com.meteorjs.capacitor;

import android.content.Context;
import android.net.Uri;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

final class AssetBundleDownloader {

    interface Callback {
        void onFinished();
        void onFailure(Throwable cause);
    }

    enum Status {
        SUSPENDED,
        RUNNING,
        WAITING,
        CANCELING,
        INVALID
    }

    private static final Pattern RUNTIME_CONFIG_PATTERN = Pattern.compile(
        "__meteor_runtime_config__ = JSON.parse\\(decodeURIComponent\\(\\\"([^\\\"]*)\\\"\\)\\)"
    );

    private final WebAppConfiguration configuration;
    private final AssetBundle assetBundle;
    private final URL baseUrl;
    private final Callback callback;

    private final ExecutorService stateExecutor = Executors.newSingleThreadExecutor();
    private final ExecutorService downloadExecutor = Executors.newFixedThreadPool(6);
    private final ScheduledExecutorService retryScheduler = Executors.newSingleThreadScheduledExecutor();

    private final RetryStrategy retryStrategy = new RetryStrategy();
    private long retryAttempts;

    private final Set<Asset> missingAssets;
    private final Set<Asset> activeDownloads = new HashSet<>();
    private final Map<Asset, HttpURLConnection> activeConnections = new HashMap<>();

    private final NetworkReachabilityManager reachabilityManager;
    private boolean callbackDelivered;
    private Status status = Status.SUSPENDED;

    AssetBundleDownloader(
        Context context,
        WebAppConfiguration configuration,
        AssetBundle assetBundle,
        URL baseUrl,
        Set<Asset> missingAssets,
        Callback callback
    ) {
        this.configuration = configuration;
        this.assetBundle = assetBundle;
        this.baseUrl = baseUrl;
        this.callback = callback;
        this.missingAssets = new HashSet<>(missingAssets);

        this.reachabilityManager = new NetworkReachabilityManager(context, this::onStateThread);
        this.reachabilityManager.setCallback(status -> {
            if (status == NetworkReachabilityManager.Status.REACHABLE && this.status == Status.WAITING) {
                resumeInternal();
            }
        });
        this.reachabilityManager.startMonitoring();
    }

    AssetBundle getAssetBundle() {
        return assetBundle;
    }

    void resume() {
        onStateThread(this::resumeInternal);
    }

    void cancel() {
        onStateThread(this::cancelInternal);
    }

    private void resumeInternal() {
        if (status == Status.CANCELING || status == Status.INVALID) {
            return;
        }

        status = Status.RUNNING;

        if (missingAssets.isEmpty() && activeDownloads.isEmpty()) {
            finish();
            return;
        }

        for (Asset asset : missingAssets) {
            if (activeDownloads.contains(asset)) {
                continue;
            }

            activeDownloads.add(asset);
            downloadExecutor.execute(() -> downloadAsset(asset));
        }
    }

    private void downloadAsset(Asset asset) {
        try {
            validateAssetFilePath(asset);
            URL downloadUrl = downloadUrlForAsset(asset);
            HttpURLConnection connection = (HttpURLConnection) downloadUrl.openConnection();
            connection.setRequestMethod("GET");
            connection.setUseCaches(false);
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(30000);

            onStateThread(() -> activeConnections.put(asset, connection));

            int statusCode = connection.getResponseCode();
            verifyResponse(connection, statusCode, asset);

            if (statusCode == HttpURLConnection.HTTP_NOT_FOUND && isSourceMapAsset(asset)) {
                onStateThread(() -> markAssetCompleted(asset));
                return;
            }

            File destinationFile = asset.getFile();
            if (destinationFile == null) {
                throw new WebAppError(
                    WebAppError.Type.FILE_SYSTEM_ERROR,
                    "Downloaded bundle asset has no filesystem destination"
                );
            }

            try (InputStream inputStream = connection.getInputStream()) {
                try {
                    FileOps.copy(inputStream, destinationFile);
                } catch (IOException e) {
                    throw new WebAppError(
                        WebAppError.Type.FILE_SYSTEM_ERROR,
                        "Failed to write downloaded asset: " + asset.filePath,
                        e
                    );
                }
            }

            if ("index.html".equals(asset.filePath)) {
                verifyRuntimeConfig(destinationFile);
            }

            onStateThread(() -> markAssetCompleted(asset));
        } catch (RetryableDownloadException e) {
            onStateThread(() -> scheduleRetry(asset));
        } catch (IOException e) {
            onStateThread(() -> scheduleRetry(asset));
        } catch (WebAppError e) {
            onStateThread(() -> fail(e));
        } catch (Throwable cause) {
            onStateThread(() -> fail(cause));
        } finally {
            onStateThread(() -> {
                HttpURLConnection connection = activeConnections.remove(asset);
                if (connection != null) {
                    connection.disconnect();
                }
            });
        }
    }

    private URL downloadUrlForAsset(Asset asset) throws IOException {
        String urlPath = asset.urlPath;
        if (urlPath.startsWith("/")) {
            urlPath = urlPath.substring(1);
        }

        if (!"index.html".equals(asset.filePath)) {
            String separator = urlPath.contains("?") ? "&" : "?";
            urlPath = urlPath + separator + "meteor_dont_serve_index=true";
        }

        return new URL(baseUrl, urlPath);
    }

    private void verifyResponse(HttpURLConnection connection, int statusCode, Asset asset)
        throws WebAppError, RetryableDownloadException {
        if (statusCode < 200 || statusCode >= 300) {
            if (statusCode == HttpURLConnection.HTTP_NOT_FOUND && isSourceMapAsset(asset)) {
                return;
            }

            if (statusCode >= 500) {
                throw new RetryableDownloadException("Server returned " + statusCode + " for asset " + asset.urlPath);
            }

            throw new WebAppError(
                WebAppError.Type.DOWNLOAD_FAILURE,
                "Non-success status code " + statusCode + " for asset: " + asset.urlPath
            );
        }

        String expectedHash = asset.hash;
        if (expectedHash == null) {
            return;
        }

        String etag = connection.getHeaderField("ETag");
        if (etag == null) {
            etag = connection.getHeaderField("Etag");
        }

        String actualHash = WebAppUtils.sha1FromEtag(etag);
        if (actualHash != null && !expectedHash.equals(actualHash)) {
            throw new WebAppError(
                WebAppError.Type.DOWNLOAD_FAILURE,
                "Hash mismatch for asset: " + asset.urlPath
            );
        }
    }

    private void verifyRuntimeConfig(File indexFile) throws WebAppError {
        String indexContent;
        try {
            indexContent = readUtf8(indexFile);
        } catch (IOException e) {
            throw new WebAppError(
                WebAppError.Type.DOWNLOAD_FAILURE,
                "Could not read downloaded index.html",
                e
            );
        }

        Matcher matcher = RUNTIME_CONFIG_PATTERN.matcher(indexContent);
        if (!matcher.find()) {
            throw new WebAppError(
                WebAppError.Type.UNSUITABLE_ASSET_BUNDLE,
                "Could not find runtime config in downloaded index.html"
            );
        }

        final JSONObject runtimeConfig;
        try {
            String decoded = Uri.decode(matcher.group(1));
            runtimeConfig = new JSONObject(decoded);
        } catch (JSONException e) {
            throw new WebAppError(
                WebAppError.Type.UNSUITABLE_ASSET_BUNDLE,
                "Could not parse runtime config in downloaded index.html",
                e
            );
        }

        String expectedVersion = assetBundle.getVersion();
        String actualVersion = runtimeConfig.optString("autoupdateVersionCordova", null);
        if (actualVersion != null && !expectedVersion.equals(actualVersion)) {
            throw new WebAppError(
                WebAppError.Type.DOWNLOAD_FAILURE,
                "Version mismatch for index.html, expected: " + expectedVersion + ", actual: " + actualVersion
            );
        }

        String runtimeRootUrl = runtimeConfig.optString("ROOT_URL", null);
        if (runtimeRootUrl == null) {
            throw new WebAppError(
                WebAppError.Type.UNSUITABLE_ASSET_BUNDLE,
                "Could not find ROOT_URL in downloaded asset bundle"
            );
        }

        String previousRootUrl = configuration.getRootUrlString();
        if (previousRootUrl != null) {
            Uri previousUri = Uri.parse(previousRootUrl);
            Uri runtimeUri = Uri.parse(runtimeRootUrl);
            if (!"localhost".equals(previousUri.getHost()) && "localhost".equals(runtimeUri.getHost())) {
                throw new WebAppError(
                    WebAppError.Type.UNSUITABLE_ASSET_BUNDLE,
                    "ROOT_URL in downloaded bundle would change current ROOT_URL to localhost"
                );
            }
        }

        String runtimeAppId = runtimeConfig.optString("appId", null);
        if (runtimeAppId == null) {
            throw new WebAppError(
                WebAppError.Type.UNSUITABLE_ASSET_BUNDLE,
                "Could not find appId in downloaded asset bundle"
            );
        }

        String existingAppId = configuration.getAppId();
        if (existingAppId != null && !existingAppId.equals(runtimeAppId)) {
            throw new WebAppError(
                WebAppError.Type.UNSUITABLE_ASSET_BUNDLE,
                "appId in downloaded asset bundle does not match current appId"
            );
        }
    }

    private void validateAssetFilePath(Asset asset) throws WebAppError {
        String filePath = asset.filePath;
        if (filePath.startsWith("/")) {
            throw new WebAppError(
                WebAppError.Type.UNSUITABLE_ASSET_BUNDLE,
                "Asset file path cannot be absolute: " + filePath
            );
        }
        if (filePath.contains("\\") || filePath.contains("..")) {
            throw new WebAppError(
                WebAppError.Type.UNSUITABLE_ASSET_BUNDLE,
                "Asset file path is invalid: " + filePath
            );
        }

        File bundleRoot = assetBundle.resolveFile(".");
        File assetFile = asset.getFile();
        if (bundleRoot == null || assetFile == null) {
            throw new WebAppError(
                WebAppError.Type.FILE_SYSTEM_ERROR,
                "Asset bundle is missing a writable download directory"
            );
        }

        try {
            String rootCanonical = bundleRoot.getCanonicalPath();
            String fileCanonical = assetFile.getCanonicalPath();
            if (!fileCanonical.startsWith(rootCanonical + File.separator)) {
                throw new WebAppError(
                    WebAppError.Type.UNSUITABLE_ASSET_BUNDLE,
                    "Asset file path escapes bundle directory: " + filePath
                );
            }
        } catch (IOException e) {
            throw new WebAppError(
                WebAppError.Type.FILE_SYSTEM_ERROR,
                "Could not validate bundle file path",
                e
            );
        }
    }

    private void markAssetCompleted(Asset asset) {
        if (status == Status.CANCELING || status == Status.INVALID) {
            return;
        }

        activeDownloads.remove(asset);
        missingAssets.remove(asset);
        retryAttempts = 0;

        if (missingAssets.isEmpty() && activeDownloads.isEmpty()) {
            finish();
        }
    }

    private void scheduleRetry(Asset asset) {
        if (status == Status.CANCELING || status == Status.INVALID) {
            return;
        }

        activeDownloads.remove(asset);

        if (status == Status.WAITING) {
            return;
        }

        status = Status.WAITING;

        double intervalSeconds = retryStrategy.retryIntervalForAttempt(retryAttempts);
        retryAttempts += 1;

        long delayMillis = (long) (intervalSeconds * 1000.0d);
        retryScheduler.schedule(() -> onStateThread(this::resumeInternal), delayMillis, TimeUnit.MILLISECONDS);
    }

    private void finish() {
        if (status == Status.CANCELING || status == Status.INVALID || callbackDelivered) {
            return;
        }

        status = Status.INVALID;
        callbackDelivered = true;

        reachabilityManager.stopMonitoring();
        downloadExecutor.shutdownNow();
        retryScheduler.shutdownNow();
        callback.onFinished();
        stateExecutor.shutdownNow();
    }

    private void fail(Throwable cause) {
        if (status == Status.INVALID || callbackDelivered) {
            return;
        }

        cancelInternal();
        callbackDelivered = true;
        callback.onFailure(cause);
    }

    private void cancelInternal() {
        if (status == Status.CANCELING || status == Status.INVALID) {
            return;
        }

        status = Status.CANCELING;

        for (HttpURLConnection connection : activeConnections.values()) {
            connection.disconnect();
        }
        activeConnections.clear();
        activeDownloads.clear();

        reachabilityManager.stopMonitoring();
        downloadExecutor.shutdownNow();
        retryScheduler.shutdownNow();

        status = Status.INVALID;
        stateExecutor.shutdownNow();
    }

    private static boolean isSourceMapAsset(Asset asset) {
        return asset.urlPath.endsWith(".map") || asset.filePath.endsWith(".map");
    }

    private static String readUtf8(File file) throws IOException {
        StringBuilder builder = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(new java.io.FileInputStream(file), StandardCharsets.UTF_8))) {
            char[] buffer = new char[4096];
            int count;
            while ((count = reader.read(buffer)) != -1) {
                builder.append(buffer, 0, count);
            }
        }
        return builder.toString();
    }

    private void onStateThread(Runnable runnable) {
        if (stateExecutor.isShutdown()) {
            return;
        }

        try {
            stateExecutor.execute(runnable);
        } catch (RejectedExecutionException ignored) {
            // ignore race with shutdown
        }
    }

    private static final class RetryableDownloadException extends Exception {
        RetryableDownloadException(String message) {
            super(message);
        }
    }
}
