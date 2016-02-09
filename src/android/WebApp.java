package com.meteor.webapp;

import android.content.res.AssetManager;
import android.net.Uri;
import android.util.Log;

import org.apache.cordova.CallbackContext;
import org.apache.cordova.Config;
import org.apache.cordova.CordovaInterface;
import org.apache.cordova.CordovaPlugin;
import org.apache.cordova.CordovaResourceApi;
import org.apache.cordova.CordovaWebView;
import org.json.JSONArray;
import org.json.JSONException;

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;

public class WebApp extends CordovaPlugin {
    private static final String LOG_TAG = "WebApp";

    private AssetManager assetManager;
    private AssetManagerCache assetManagerCache;

    private CordovaResourceApi resourceApi;

    private Uri wwwDirectoryUri;
    private Uri applicationDirectoryUri;

    private int localServerPort = 0;
    private List<WebResourceHandler> resourceHandlers;

    private AssetBundle currentAssetBundle;

    @Override
    public void initialize(CordovaInterface cordova, CordovaWebView webView) {
        super.initialize(cordova, webView);

        assetManager = cordova.getActivity().getAssets();
        resourceApi = webView.getResourceApi();

        wwwDirectoryUri = Uri.parse("file:///android_asset/www");
        applicationDirectoryUri = Uri.withAppendedPath(wwwDirectoryUri, "application");

        // FIXME: Find a way to get the launchUrl without using
        // the deprecated Config singleton
        localServerPort = Uri.parse(Config.getStartUrl()).getPort();

        resourceHandlers = new ArrayList<WebResourceHandler>();

        initializeResourceHandlers();

        cordova.getThreadPool().execute(new Runnable() {
            public void run() {
                try {
                    assetManagerCache = new AssetManagerCache(assetManager);
                } catch (IOException e) {
                    Log.e(LOG_TAG, "Could not load asset manager cache", e);
                    return;
                }

                Uri manifestUri = Uri.withAppendedPath(applicationDirectoryUri, "program.json");
                AssetManifest assetManifest = loadAssetManifest(manifestUri);
                if (assetManifest != null) {
                    currentAssetBundle = new AssetBundle(applicationDirectoryUri, assetManifest);
                    Log.d(LOG_TAG, "Serving asset bundle with version: " + currentAssetBundle.getVersion());
                }
            }
        });
    }

    @Override
    public boolean execute(String action, JSONArray args, CallbackContext callbackContext) throws JSONException {
        return true;
    }

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

                // Do not serve files from /application, because these should only be served through the initial asset bundle
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

        // Serve index.html as a last resort
        resourceHandlers.add(new WebResourceHandler() {
            @Override
            public Uri remapUri(Uri uri) {
                if (currentAssetBundle == null) return null;

                String path = uri.getPath();

                if (path.equals("favicon.ico")) return null;

                AssetBundle.Asset asset = currentAssetBundle.getIndexFile();
                if (asset != null) {
                    return asset.getFileUri();
                } else {
                    return null;
                }
            }
        });
    }

    private AssetManifest loadAssetManifest(Uri uri) {
        InputStream inputStream = null;
        try {
            inputStream = resourceApi.openForRead(uri).inputStream;
            return new AssetManifest(inputStream);
        } catch (IOException e) {
            Log.e(LOG_TAG, "Error loading asset manifest", e);
            return null;
        } catch (JSONException e) {
            Log.e(LOG_TAG, "Error parsing asset manifest", e);
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

    @Override
    public Uri remapUri(Uri uri) {
        if (!(uri.getScheme().equals("http") && uri.getHost().equals("localhost") && uri.getPort() == localServerPort)) return null;

        Uri remappedUri = null;
        for (WebResourceHandler handler : resourceHandlers) {
            remappedUri = handler.remapUri(uri);
            if (remappedUri != null) break;
        }

        return remappedUri;
    }
}
