package com.meteor.webapp;

import android.content.res.AssetManager;
import android.net.Uri;
import android.os.StrictMode;
import android.util.Log;

import org.apache.cordova.CallbackContext;
import org.apache.cordova.CordovaPlugin;
import org.apache.cordova.CordovaResourceApi;
import org.apache.cordova.PluginResult;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.math.BigInteger;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;

import okhttp3.Headers;
import okhttp3.mockwebserver.Dispatcher;
import okhttp3.mockwebserver.MockResponse;
import okhttp3.mockwebserver.MockWebServer;
import okhttp3.mockwebserver.RecordedRequest;
import okio.Buffer;
import okio.Okio;

public class WebAppMockRemoteServer extends CordovaPlugin implements WebAppLocalServer.TestingDelegate {
    private static final String LOG_TAG = WebAppMockRemoteServer.class.getSimpleName();

    private static final String BASE_PATH = "/__cordova/";

    private static final Uri ASSET_BASE_URI = Uri.parse("file:///android_asset");
;
    private CordovaResourceApi resourceApi;

    private AssetManager assetManager;
    private AssetManagerCache assetManagerCache;

    private WebAppLocalServer webAppLocalServer;

    private Uri downloadableVersionsUri;
    private Uri currentVersionUri;

    private MockWebServer server;

    @Override
    protected void pluginInitialize() {
        super.pluginInitialize();

        resourceApi = webView.getResourceApi();

        webAppLocalServer = (WebAppLocalServer)webView.getPluginManager().getPlugin("WebAppLocalServer");
        webAppLocalServer.setTestingDelegate(this);

        resourceApi = webView.getResourceApi();

        assetManager = cordova.getActivity().getAssets();
        assetManagerCache = webAppLocalServer.getAssetManagerCache();

        downloadableVersionsUri = Uri.withAppendedPath(ASSET_BASE_URI, "www/downloadable_versions");

        // Avoid NetworkOnMainThreadException being thrown when starting server
        StrictMode.setThreadPolicy(StrictMode.ThreadPolicy.LAX);

        startServer();
    }

    protected void startServer() {
        server = new MockWebServer();

        server.setDispatcher(new Dispatcher() {
            @Override
            public MockResponse dispatch(RecordedRequest request) throws InterruptedException {
                assert (currentVersionUri != null);

                String path = request.getPath();
                if (!path.startsWith(BASE_PATH)) return new MockResponse().setResponseCode(500);

                path = path.substring(BASE_PATH.length());

                path = path.split(Pattern.quote("?"))[0];

                if (path.length() < 1) {
                    path = "index.html";
                }

                Uri assetUri = Uri.withAppendedPath(currentVersionUri, path);

                try {
                    CordovaResourceApi.OpenForReadResult openForReadResult = resourceApi.openForRead(assetUri);
                    Buffer body = new Buffer();
                    body.writeAll(Okio.source(openForReadResult.inputStream));

                    MockResponse response = new MockResponse();
                    response.setBody(body.clone());

                    MessageDigest digester = MessageDigest.getInstance("SHA1");
                    digester.update(body.readByteArray());
                    String hash = new BigInteger(1, digester.digest()).toString(16);
                    response.addHeader("ETag", "\"" + hash + "\"");

                    return response;
                } catch (FileNotFoundException e) {
                    return new MockResponse().setResponseCode(404);
                } catch (Exception e) {
                    Log.e(LOG_TAG, "Error serving asset: " + assetUri, e);
                    return new MockResponse().setResponseCode(500);
                }
            }
        });

        try {
            server.start(3000);
        } catch (IOException e) {
            Log.e(LOG_TAG, "Could not start mock web server", e);
        }
    }

    @Override
    public boolean execute(String action, JSONArray args, CallbackContext callbackContext) throws JSONException {
        if ("serveVersion".equals(action)) {
            String version = args.getString(0);
            serveVersion(version, callbackContext);
            return true;
        } else if ("getAuthTokenKeyValuePair".equals(action)) {
            getAuthTokenKeyValuePair(callbackContext);
            return true;
        } else if ("receivedRequests".equals(action)) {
            receivedRequests(callbackContext);
            return true;
        } else if ("simulatePageReload".equals(action)) {
            simulatePageReload(callbackContext);
            return true;
        } else if ("simulateAppRestart".equals(action)) {
            simulateAppRestart(callbackContext);
            return true;
        } else if ("resetToInitialState".equals(action)) {
            resetToInitialState(callbackContext);
            return true;
        } else if ("downloadedVersionExists".equals(action)) {
            String version = args.getString(0);
            downloadedVersionExists(version, callbackContext);
            return true;
        } else if ("simulatePartialDownload".equals(action)) {
            String version = args.getString(0);
            simulatePartialDownload(version, callbackContext);
            return true;
        }

        return false;
    }

    private void serveVersion(String version, final CallbackContext callbackContext) {
        removeReceivedRequests();
        currentVersionUri = Uri.withAppendedPath(downloadableVersionsUri, version);
        callbackContext.success();
    }

    private void getAuthTokenKeyValuePair(final CallbackContext callbackContext) {
        callbackContext.success((String) null);
    }

    private void receivedRequests(final CallbackContext callbackContext) {
        List<JSONObject> requestsJSON = new ArrayList<JSONObject>();
        try {
            RecordedRequest request;
            while ((request = server.takeRequest(0, TimeUnit.MILLISECONDS)) != null) {
                JSONObject requestJSON = new JSONObject();
                String[] pathAndQuery = request.getPath().split(Pattern.quote("?"));
                requestJSON.put("path", pathAndQuery[0]);
                if (pathAndQuery.length > 1) {
                    requestJSON.put("query", pathAndQuery[1]);
                }

                Headers headers = request.getHeaders();
                JSONObject headersJSON = new JSONObject();
                for (int i = 0; i < headers.size(); i++) {
                    String name = headers.name(i);
                    String value = headers.value(i);
                    headersJSON.put(name, value);
                }
                requestJSON.put("headers", headersJSON);
                requestsJSON.add(requestJSON);
            }
        } catch (Exception e) {
            Log.e(LOG_TAG, "Could not retrieve received requests", e);
        }

        PluginResult pluginResult = new PluginResult(PluginResult.Status.OK, new JSONArray(requestsJSON));
        callbackContext.sendPluginResult(pluginResult);
    }

    private void removeReceivedRequests() {
        RecordedRequest request;
        try {
            while ((request = server.takeRequest(0, TimeUnit.MILLISECONDS)) != null) {
            }
        } catch (InterruptedException e) {
            Log.e(LOG_TAG, "Error removing received requests", e);
        }
    }

    private void simulatePageReload(final CallbackContext callbackContext) {
        webAppLocalServer.onReset();

        callbackContext.success();
    }

    private void simulateAppRestart(final CallbackContext callbackContext) {
        try {
            webAppLocalServer.initializeAssetBundles();
        } catch (WebAppException e) {
            Log.e(LOG_TAG, "Could not initialize asset bundles", e);
            callbackContext.error(e.getMessage());
            return;
        }
        webAppLocalServer.onReset();

        callbackContext.success();
    }

    private void resetToInitialState(final CallbackContext callbackContext) {
        cordova.getThreadPool().execute(new Runnable() {
            @Override
            public void run() {
                webAppLocalServer.getConfiguration().reset();
                try {
                    webAppLocalServer.initializeAssetBundles();
                } catch (WebAppException e) {
                    Log.e(LOG_TAG, "Could not initialize asset bundles", e);
                    callbackContext.error(e.getMessage());
                    return;
                }
                webAppLocalServer.onReset();

                removeReceivedRequests();

                callbackContext.success();
            }
        });
    }

    private void downloadedVersionExists(String version, final CallbackContext callbackContext) {
        boolean versionExists = webAppLocalServer.getAssetBundleManager().downloadedAssetBundleWithVersion(version) != null;
        PluginResult pluginResult = new PluginResult(PluginResult.Status.OK, versionExists);
        callbackContext.sendPluginResult(pluginResult);
    }

    private void simulatePartialDownload(final String version, final CallbackContext callbackContext) {
        cordova.getThreadPool().execute(new Runnable() {
            @Override
            public void run() {
                String sourcePath = "www/partially_downloaded_versions/" + version;

                File destinationDirectory = webAppLocalServer.getAssetBundleManager().getDownloadDirectory();
                if (destinationDirectory.exists()) {
                    IOUtils.deleteRecursively(destinationDirectory);
                }
                destinationDirectory.mkdirs();

                try {
                    copyRecursively(sourcePath, Uri.fromFile(destinationDirectory));
                } catch (IOException e) {
                    Log.e(LOG_TAG, "Could not copy partially downloaded version", e);
                }

                callbackContext.success();
            }
        });
    }

    private void copyRecursively(String path, Uri destinationUri) throws IOException {
        String[] children = assetManagerCache.list(path);

        if (children != null) {
            for (String child : children) {
                copyRecursively(path + "/" + child, Uri.withAppendedPath(destinationUri, child));
            }
        } else {
            resourceApi.copyResource(Uri.withAppendedPath(ASSET_BASE_URI, path), destinationUri);
        }
    }
}
