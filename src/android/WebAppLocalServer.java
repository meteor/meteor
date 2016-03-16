package com.meteor.webapp;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.res.AssetManager;
import android.net.Uri;
import android.util.Log;

import org.apache.cordova.CallbackContext;
import org.apache.cordova.Config;
import org.apache.cordova.CordovaPlugin;
import org.apache.cordova.CordovaResourceApi;
import org.apache.cordova.PluginResult;
import org.json.JSONArray;
import org.json.JSONException;

import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Timer;
import java.util.TimerTask;

import okhttp3.HttpUrl;

public class WebAppLocalServer extends CordovaPlugin implements AssetBundleManager.Callback {
    private static final String LOG_TAG = "MeteorWebApp";
    public static final String PREFS_NAME = "MeteorWebApp";

    private static final String LOCAL_FILESYSTEM_PATH = "/local-filesystem";

    private AssetManager assetManager;
    private AssetManagerCache assetManagerCache;

    private CordovaResourceApi resourceApi;

    private WebAppConfiguration configuration;

    private Uri wwwDirectoryUri;
    private Uri applicationDirectoryUri;

    private String launchUrl;
    private int localServerPort;

    private List<WebResourceHandler> resourceHandlers;

    /** The asset bundle manager is responsible for managing asset bundles
    and checking for updates */
    private AssetBundleManager assetBundleManager;

    /** The asset bundle currently used to serve assets from */
    private AssetBundle currentAssetBundle;

    /** Downloaded asset bundles are considered pending until the next page reload
     * because we don't want the app to end up in an inconsistent state by
     * loading assets from different bundles.
     */
    private AssetBundle pendingAssetBundle;

    private CallbackContext newVersionReadyCallbackContext;
    private CallbackContext errorCallbackContext;

    /** Timer used to wait for startup to complete after a reload */
    private Timer startupTimer;
    private long startupTimeout;

    WebAppConfiguration getConfiguration() {
        return configuration;
    }

    CordovaResourceApi getResourceApi() {
        return resourceApi;
    }

    AssetBundleManager getAssetBundleManager() {
        return assetBundleManager;
    }

    AssetManagerCache getAssetManagerCache() {
        return assetManagerCache;
    }

    //region Lifecycle

    /** Called by Cordova on plugin initialization */
    @Override
    public void pluginInitialize() {
        super.pluginInitialize();

        resourceApi = webView.getResourceApi();

        wwwDirectoryUri = Uri.parse("file:///android_asset/www");
        applicationDirectoryUri = Uri.withAppendedPath(wwwDirectoryUri, "application");

        // FIXME: Find a way to get the launchUrl without using the deprecated Config singleton
        launchUrl = Config.getStartUrl();

        localServerPort = preferences.getInteger("WebAppLocalServerPort", Uri.parse(launchUrl).getPort());
        startupTimeout = preferences.getInteger("WebAppStartupTimeout", 20000);

        SharedPreferences preferences = cordova.getActivity().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        configuration = new WebAppConfiguration(preferences);

        assetManager = cordova.getActivity().getAssets();

        try {
            assetManagerCache = new AssetManagerCache(assetManager);
        } catch (IOException e) {
            Log.e(LOG_TAG, "Could not load asset manager cache", e);
            return;
        }

        try {
            initializeAssetBundles();
        } catch (WebAppException e) {
            Log.e(LOG_TAG, "Could not initialize asset bundles", e);
            return;
        }

        resourceHandlers = new ArrayList<WebResourceHandler>();
        initializeResourceHandlers();
    }

    void initializeAssetBundles() throws WebAppException {
        // The initial asset bundle consists of the assets bundled with the app
        AssetBundle initialAssetBundle = new AssetBundle(resourceApi, applicationDirectoryUri);

        // Downloaded versions are stored in /data/data/<app>/files/meteor
        File versionsDirectory = new File(cordova.getActivity().getFilesDir(), "meteor");

        // If the last seen initial version is different from the currently bundled
        // version, we delete the versions directory and unset lastDownloadedVersion
        // and blacklistedVersions
        if (!initialAssetBundle.getVersion().equals(configuration.getLastSeenInitialVersion()))  {
            Log.d(LOG_TAG, "Detected new bundled version, removing versions directory if it exists");
            if (versionsDirectory.exists()) {
                if (!IOUtils.deleteRecursively(versionsDirectory)) {
                    Log.w(LOG_TAG, "Could not remove versions directory");
                }
            }
            configuration.reset();
        }

        // We keep track of the last seen initial version (see above)
        configuration.setLastSeenInitialVersion(initialAssetBundle.getVersion());

        // If the versions directory does not exist, we create it
        if (!versionsDirectory.exists()) {
            if (!versionsDirectory.mkdirs()) {
                Log.e(LOG_TAG, "Could not create versions directory");
                return;
            }
        }

        assetBundleManager = new AssetBundleManager(resourceApi, configuration, initialAssetBundle, versionsDirectory);
        assetBundleManager.setCallback(WebAppLocalServer.this);

        String lastDownloadedVersion = configuration.getLastDownloadedVersion();
        if (lastDownloadedVersion != null) {
            currentAssetBundle = assetBundleManager.downloadedAssetBundleWithVersion(lastDownloadedVersion);
            if (currentAssetBundle == null) {
                currentAssetBundle = initialAssetBundle;
            }
        } else {
            currentAssetBundle = initialAssetBundle;
        }

        pendingAssetBundle = null;
    }

    /** Called by Cordova before page reload */
    @Override
    public void onReset() {
        super.onReset();

        // Clear existing callbacks
        newVersionReadyCallbackContext = null;
        errorCallbackContext = null;

        // If there is a pending asset bundle, we make it the current
        if (pendingAssetBundle != null) {
            currentAssetBundle = pendingAssetBundle;
            pendingAssetBundle = null;
        }

        Log.i(LOG_TAG, "Serving asset bundle with version: " + currentAssetBundle.getVersion());

        configuration.setAppId(currentAssetBundle.getAppId());
        configuration.setRootUrlString(currentAssetBundle.getRootUrlString());
        configuration.setCordovaCompatibilityVersion(currentAssetBundle.getCordovaCompatibilityVersion());

        // Don't start startup timer when running a test
        if (testingDelegate == null) {
            startStartupTimer();
        }
    }

    private void startStartupTimer() {
        removeStartupTimer();

        startupTimer = new Timer();
        startupTimer.schedule(new TimerTask() {
            @Override
            public void run() {
                Log.w(LOG_TAG, "App startup timed out, reverting to last known good version");
                revertToLastKnownGoodVersion();
            }
        }, startupTimeout);
    }

    private void removeStartupTimer() {
        if (startupTimer != null) {
            startupTimer.cancel();
            startupTimer = null;
        }
    }

    //endregion

    //region Public plugin commands

    @Override
    public boolean execute(String action, JSONArray args, CallbackContext callbackContext) throws JSONException {
        if ("checkForUpdates".equals(action)) {
            checkForUpdates(callbackContext);
            return true;
        } else if ("onNewVersionReady".equals(action)) {
            onNewVersionReady(callbackContext);
            return true;
        } else if ("onError".equals(action)) {
            onError(callbackContext);
            return true;
        } else if ("startupDidComplete".equals(action)) {
            startupDidComplete(callbackContext);
            return true;
        }

        if (testingDelegate != null) {
            return testingDelegate.execute(action, args, callbackContext);
        }

        return false;
    }

    private void checkForUpdates(final CallbackContext callbackContext) {
        cordova.getThreadPool().execute(new Runnable() {
            public void run() {
                HttpUrl rootUrl = HttpUrl.parse(currentAssetBundle.getRootUrlString());
                if (rootUrl == null) {
                    callbackContext.error("checkForUpdates requires a rootURL to be configured");
                    return;
                }
                HttpUrl baseUrl = rootUrl.resolve("__cordova/");
                assetBundleManager.checkForUpdates(baseUrl);
                callbackContext.success();
            }
        });
    }

    private void onNewVersionReady(CallbackContext callbackContext) {
        PluginResult pluginResult = new PluginResult(PluginResult.Status.NO_RESULT);
        pluginResult.setKeepCallback(true);
        callbackContext.sendPluginResult(pluginResult);

        newVersionReadyCallbackContext = callbackContext;
    }

    private void notifyNewVersionReady(String version) {
        if (newVersionReadyCallbackContext != null) {
            PluginResult pluginResult = new PluginResult(PluginResult.Status.OK, version);
            pluginResult.setKeepCallback(true);
            newVersionReadyCallbackContext.sendPluginResult(pluginResult);
        }
    }

    private void onError(CallbackContext callbackContext) {
        PluginResult pluginResult = new PluginResult(PluginResult.Status.NO_RESULT);
        pluginResult.setKeepCallback(true);
        callbackContext.sendPluginResult(pluginResult);

        errorCallbackContext = callbackContext;
    }

    private void notifyError(Throwable cause) {
        Log.e(LOG_TAG, "Download failure", cause);
        if (errorCallbackContext != null) {
            PluginResult pluginResult = new PluginResult(PluginResult.Status.OK, cause.getMessage());
            pluginResult.setKeepCallback(true);
            errorCallbackContext.sendPluginResult(pluginResult);
        }
    }

    private void startupDidComplete(CallbackContext callbackContext) {
        removeStartupTimer();

        // If startup completed successfully, we consider a version good
        configuration.setLastKnownGoodVersion(currentAssetBundle.getVersion());

        cordova.getThreadPool().execute(new Runnable() {
            @Override
            public void run() {
                assetBundleManager.removeAllDownloadedAssetBundlesExceptForVersion(currentAssetBundle.getVersion());
            }
        });

        callbackContext.success();
    }

    //endregion

    private void revertToLastKnownGoodVersion() {
        // Blacklist the current version, so we don't update to it again right away
        configuration.addBlacklistedVersion(currentAssetBundle.getVersion());

        // If there is a last known good version and we can load the bundle, revert to it
        String lastKnownGoodVersion = configuration.getLastKnownGoodVersion();
        if (lastKnownGoodVersion != null) {
            AssetBundle assetBundle = assetBundleManager.downloadedAssetBundleWithVersion(lastKnownGoodVersion);
            if (assetBundle != null) {
                pendingAssetBundle = assetBundle;
            }
        }

        // Else, revert to the initial asset bundle, unless that is what we are currently serving
        if (!currentAssetBundle.equals(assetBundleManager.initialAssetBundle)) {
            pendingAssetBundle = assetBundleManager.initialAssetBundle;
        }

        // Only reload if we have a pending asset bundle to reload
        if (pendingAssetBundle != null) {
            cordova.getActivity().runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    webView.loadUrlIntoView(launchUrl, false);

                }
            });
        }
    }

    //region AssetBundleManager.Callback

    @Override
    public boolean shouldDownloadBundleForManifest(AssetManifest manifest) {
        final String version = manifest.version;

        // No need to redownload the current version
        if (currentAssetBundle.getVersion().equals(version)) {
            Log.i(LOG_TAG, "Skipping downloading current version: " + version);
            return false;
        }

        // No need to redownload the pending version
        if (pendingAssetBundle != null && pendingAssetBundle.getVersion().equals(version)) {
            Log.i(LOG_TAG, "Skipping downloading pending version: " + version);
            return false;
        }

        // Don't download blacklisted versions
        if (configuration.getBlacklistedVersions().contains(version)) {
            notifyError(new WebAppException("Skipping downloading blacklisted version: " + version));
            return false;
        }

        // Don't download versions potentially incompatible with the bundled native code
        if (!configuration.getCordovaCompatibilityVersion().equals(manifest.cordovaCompatibilityVersion)) {
            notifyError(new WebAppException("Skipping downloading new version because the Cordova platform version or plugin versions have changed and are potentially incompatible"));
            return false;
        }

        return true;
    }

    @Override
    public void onFinishedDownloadingAssetBundle(AssetBundle assetBundle) {
        configuration.setLastDownloadedVersion(assetBundle.getVersion());
        pendingAssetBundle = assetBundle;
        notifyNewVersionReady(assetBundle.getVersion());
    }

    @Override
    public void onError(Throwable cause) {
        Log.w(LOG_TAG, "Download failure", cause);
        notifyError(cause);
    }

    //endregion

    //region Local web server

    private void initializeResourceHandlers() {
        // Serve files from the current asset bundle
        resourceHandlers.add(new WebResourceHandler() {
            @Override
            public Uri remapUri(Uri uri) {
                if (currentAssetBundle == null) return null;

                AssetBundle.Asset asset = currentAssetBundle.assetForUrlPath(uri.getPath());
                if (asset != null) {
                    return asset.getFileUri();
                } else {
                    return null;
                }
            }
        });

        // Serve files from www directory
        resourceHandlers.add(new WebResourceHandler() {
            @Override
            public Uri remapUri(Uri uri) {
                if (assetManagerCache == null) return null;

                String path = uri.getPath();

                // Do not serve files from /application, because these should only be served
                // through the initial asset bundle
                if (path.startsWith("/application")) return null;

                if (path.startsWith("/")) {
                    path = path.substring(1);
                }

                if (assetManagerCache.exists("www/" + path)) {
                    return Uri.withAppendedPath(wwwDirectoryUri, path);
                } else {
                    return null;
                }
            }
        });

        // Serve local file system at /local-filesystem/<path>
        resourceHandlers.add(new WebResourceHandler() {
            @Override
            public Uri remapUri(Uri uri) {
                String path = uri.getPath();

                if (!path.startsWith(LOCAL_FILESYSTEM_PATH)) return null;

                String filePath = path.substring(LOCAL_FILESYSTEM_PATH.length());
                return new Uri.Builder().scheme("file").appendPath(filePath).build();
            }
        });

        // Serve index.html as a last resort
        resourceHandlers.add(new WebResourceHandler() {
            @Override
            public Uri remapUri(Uri uri) {
                if (currentAssetBundle == null) return null;

                String path = uri.getPath();

                // Don't serve index.html for local file system paths
                if (path.startsWith(LOCAL_FILESYSTEM_PATH)) return null;

                if (path.equals("/favicon.ico")) return null;

                AssetBundle.Asset asset = currentAssetBundle.getIndexFile();
                if (asset != null) {
                    return asset.getFileUri();
                } else {
                    return null;
                }
            }
        });
    }

    @Override
    public Uri remapUri(Uri uri) {
        if (!(uri.getScheme().equals("http") && uri.getHost().equals("localhost") && uri.getPort() == localServerPort)) return null;

        Uri remappedUri = null;
        for (WebResourceHandler handler : resourceHandlers) {
            remappedUri = handler.remapUri(uri);
            if (remappedUri != null) break;
        }

        if (remappedUri != null) {
            return remappedUri;
        } else {
            // This will result in a call to handleOpenForRead(), which we use to return a 404 response
            return toPluginUri(uri);
        }
    }

    @Override
    public CordovaResourceApi.OpenForReadResult handleOpenForRead(Uri uri) throws IOException {
        Uri originalUri = fromPluginUri(uri);
        // Returning a null inputStream will result in a 404 response
        return new CordovaResourceApi.OpenForReadResult(originalUri, null, null, 0, null);
    }

    //endregion

    //region Testing support

    public interface TestingDelegate {
        boolean execute(String action, JSONArray args, CallbackContext callbackContext) throws JSONException;
    }

    private TestingDelegate testingDelegate;

    void setTestingDelegate(TestingDelegate testingDelegate) {
        this.testingDelegate = testingDelegate;
    }

    //endregion
}
