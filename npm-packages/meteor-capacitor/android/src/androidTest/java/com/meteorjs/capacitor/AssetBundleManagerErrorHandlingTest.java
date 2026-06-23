package com.meteorjs.capacitor;

import android.content.Context;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.io.File;
import java.net.URL;
import java.net.URLEncoder;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import okhttp3.mockwebserver.Dispatcher;
import okhttp3.mockwebserver.MockResponse;
import okhttp3.mockwebserver.MockWebServer;
import okhttp3.mockwebserver.RecordedRequest;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

@RunWith(AndroidJUnit4.class)
public class AssetBundleManagerErrorHandlingTest {

    private MockWebServer server;
    private File versionsDirectory;
    private Context context;
    private String appId;
    private String rootUrl;
    private String compatibility;

    @Before
    public void setUp() throws Exception {
        server = new MockWebServer();
        server.start();

        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        versionsDirectory = new File(context.getFilesDir(), "meteor-test-" + UUID.randomUUID());
        if (versionsDirectory.exists()) {
            FileOps.deleteRecursively(versionsDirectory);
        }
        assertTrue(versionsDirectory.mkdirs());

        appId = "test-app-id";
        rootUrl = server.url("/").toString();
        compatibility = "android-1";
    }

    @After
    public void tearDown() throws Exception {
        if (server != null) {
            server.shutdown();
        }
        if (versionsDirectory != null) {
            FileOps.deleteRecursively(versionsDirectory);
        }
    }

    private WebAppConfiguration createConfiguration() {
        WebAppConfiguration configuration = new WebAppConfiguration(
            context.getSharedPreferences("MeteorWebApp-Test-" + UUID.randomUUID(), Context.MODE_PRIVATE)
        );
        configuration.reset();
        configuration.setAppId(appId);
        configuration.setRootUrlString(rootUrl);
        configuration.setCordovaCompatibilityVersion(compatibility);
        return configuration;
    }

    private AssetBundle createInitialBundle() throws Exception {
        TestBundleBuilder builder = new TestBundleBuilder("v-initial", appId, rootUrl, compatibility);
        return builder.buildAssetBundle(null);
    }

    private Throwable runExpectingError(Dispatcher dispatcher) throws Exception {
        server.setDispatcher(dispatcher);

        AssetBundle initialBundle = createInitialBundle();
        WebAppConfiguration configuration = createConfiguration();
        AssetBundleManager manager = new AssetBundleManager(context, configuration, versionsDirectory, initialBundle);

        CountDownLatch latch = new CountDownLatch(1);
        AtomicReference<AssetBundle> downloaded = new AtomicReference<>();
        AtomicReference<Throwable> failure = new AtomicReference<>();

        manager.setCallback(new AssetBundleManager.Callback() {
            @Override
            public boolean shouldDownloadBundleForManifest(AssetManifest manifest) {
                return true;
            }

            @Override
            public void onFinishedDownloadingAssetBundle(AssetBundle assetBundle) {
                downloaded.set(assetBundle);
                latch.countDown();
            }

            @Override
            public void onError(Throwable cause) {
                failure.set(cause);
                latch.countDown();
            }
        });

        URL baseUrl = server.url("/__cordova/").url();
        manager.checkForUpdates(baseUrl);

        assertTrue("Timed out waiting for callback", latch.await(30, TimeUnit.SECONDS));
        manager.shutdown();

        assertNull("Should not have downloaded successfully", downloaded.get());
        return failure.get();
    }

    private WebAppError assertWebAppErrorOfType(Throwable error, WebAppError.Type expectedType) {
        assertNotNull("Should have received an error", error);
        assertTrue("Expected WebAppError but got " + error.getClass().getName(), error instanceof WebAppError);
        WebAppError webAppError = (WebAppError) error;
        assertEquals("Unexpected WebAppError type", expectedType, webAppError.getType());
        return webAppError;
    }

    @Test
    public void missingAsset_callsOnError() throws Exception {
        String version = "v-missing-asset";
        TestBundleBuilder builder = new TestBundleBuilder(version, appId, rootUrl, compatibility)
            .addAsset("app/main.js", "js", "console.log('exists');")
            .addAsset("app/missing.js", "js", "// never served");

        String manifestJson = builder.buildManifestJson();
        String indexHtml = builder.buildIndexHtml();
        String existsHash = builder.getAssets().get(0).hash;

        Throwable error = runExpectingError(new Dispatcher() {
            @Override
            public MockResponse dispatch(RecordedRequest request) {
                String path = request.getPath();
                String cleanPath = path == null ? "" : path.split("\\?")[0];

                if ("/__cordova/manifest.json".equals(cleanPath)) {
                    return new MockResponse().setResponseCode(200).setBody(manifestJson);
                }
                if ("/__cordova/".equals(cleanPath)) {
                    return new MockResponse().setResponseCode(200).setBody(indexHtml);
                }
                if ("/__cordova/app/main.js".equals(cleanPath)) {
                    return new MockResponse()
                        .setResponseCode(200)
                        .addHeader("ETag", "\"" + existsHash + "\"")
                        .setBody("console.log('exists');");
                }
                // missing.js returns 404
                return new MockResponse().setResponseCode(404);
            }
        });

        WebAppError webAppError = assertWebAppErrorOfType(error, WebAppError.Type.DOWNLOAD_FAILURE);
        // Secondary: verify message mentions specific detail.
        assertTrue("Error should mention non-success status",
            webAppError.getMessage().contains("Non-success status code") || webAppError.getMessage().contains("404"));
    }

    @Test
    public void invalidAssetHash_callsOnError() throws Exception {
        String version = "v-bad-hash";
        TestBundleBuilder builder = new TestBundleBuilder(version, appId, rootUrl, compatibility)
            .addAsset("app/main.js", "js", "console.log('hash test');");

        String manifestJson = builder.buildManifestJson();
        String indexHtml = builder.buildIndexHtml();

        Throwable error = runExpectingError(new Dispatcher() {
            @Override
            public MockResponse dispatch(RecordedRequest request) {
                String path = request.getPath();
                String cleanPath = path == null ? "" : path.split("\\?")[0];

                if ("/__cordova/manifest.json".equals(cleanPath)) {
                    return new MockResponse().setResponseCode(200).setBody(manifestJson);
                }
                if ("/__cordova/".equals(cleanPath)) {
                    return new MockResponse().setResponseCode(200).setBody(indexHtml);
                }
                if ("/__cordova/app/main.js".equals(cleanPath)) {
                    // Return a wrong hash in ETag
                    return new MockResponse()
                        .setResponseCode(200)
                        .addHeader("ETag", "\"0000000000000000000000000000000000000000\"")
                        .setBody("console.log('hash test');");
                }
                return new MockResponse().setResponseCode(404);
            }
        });

        WebAppError webAppError = assertWebAppErrorOfType(error, WebAppError.Type.DOWNLOAD_FAILURE);
        // Secondary: verify message mentions specific detail.
        assertTrue("Error should mention hash mismatch",
            webAppError.getMessage().contains("Hash mismatch"));
    }

    @Test
    public void versionMismatchInIndexPage_callsOnError() throws Exception {
        String version = "v-version-mismatch";
        TestBundleBuilder builder = new TestBundleBuilder(version, appId, rootUrl, compatibility)
            .addAsset("app/main.js", "js", "console.log('ver mismatch');");

        String manifestJson = builder.buildManifestJson();
        String mainHash = builder.getAssets().get(0).hash;

        // Build index.html with a DIFFERENT autoupdateVersionCordova
        String wrongRuntimeConfig = "{\"ROOT_URL\":\"" + rootUrl + "\","
            + "\"appId\":\"" + appId + "\","
            + "\"autoupdateVersionCordova\":\"v-WRONG\"}";
        String wrongIndexHtml;
        try {
            wrongIndexHtml = "<html><head><script>__meteor_runtime_config__ = JSON.parse(decodeURIComponent(\""
                + URLEncoder.encode(wrongRuntimeConfig, "UTF-8")
                + "\"))</script></head><body></body></html>";
        } catch (Exception e) {
            throw new RuntimeException(e);
        }

        Throwable error = runExpectingError(new Dispatcher() {
            @Override
            public MockResponse dispatch(RecordedRequest request) {
                String path = request.getPath();
                String cleanPath = path == null ? "" : path.split("\\?")[0];

                if ("/__cordova/manifest.json".equals(cleanPath)) {
                    return new MockResponse().setResponseCode(200).setBody(manifestJson);
                }
                if ("/__cordova/".equals(cleanPath)) {
                    return new MockResponse().setResponseCode(200).setBody(wrongIndexHtml);
                }
                if ("/__cordova/app/main.js".equals(cleanPath)) {
                    return new MockResponse()
                        .setResponseCode(200)
                        .addHeader("ETag", "\"" + mainHash + "\"")
                        .setBody("console.log('ver mismatch');");
                }
                return new MockResponse().setResponseCode(404);
            }
        });

        WebAppError webAppError = assertWebAppErrorOfType(error, WebAppError.Type.DOWNLOAD_FAILURE);
        // Secondary: verify message mentions specific detail.
        assertTrue("Error should mention version mismatch",
            webAppError.getMessage().contains("Version mismatch"));
    }

    @Test
    public void missingRootUrlInIndexPage_callsOnError() throws Exception {
        String version = "v-no-rooturl";
        TestBundleBuilder builder = new TestBundleBuilder(version, appId, rootUrl, compatibility)
            .addAsset("app/main.js", "js", "console.log('no root');");

        String manifestJson = builder.buildManifestJson();
        String mainHash = builder.getAssets().get(0).hash;

        // Build index.html WITHOUT ROOT_URL
        String noRootConfig = "{\"appId\":\"" + appId + "\","
            + "\"autoupdateVersionCordova\":\"" + version + "\"}";
        String noRootIndexHtml = builder.buildIndexHtmlWithConfig(noRootConfig);

        Throwable error = runExpectingError(new Dispatcher() {
            @Override
            public MockResponse dispatch(RecordedRequest request) {
                String path = request.getPath();
                String cleanPath = path == null ? "" : path.split("\\?")[0];

                if ("/__cordova/manifest.json".equals(cleanPath)) {
                    return new MockResponse().setResponseCode(200).setBody(manifestJson);
                }
                if ("/__cordova/".equals(cleanPath)) {
                    return new MockResponse().setResponseCode(200).setBody(noRootIndexHtml);
                }
                if ("/__cordova/app/main.js".equals(cleanPath)) {
                    return new MockResponse()
                        .setResponseCode(200)
                        .addHeader("ETag", "\"" + mainHash + "\"")
                        .setBody("console.log('no root');");
                }
                return new MockResponse().setResponseCode(404);
            }
        });

        WebAppError webAppError = assertWebAppErrorOfType(error, WebAppError.Type.UNSUITABLE_ASSET_BUNDLE);
        // Secondary: verify message mentions specific detail.
        assertTrue("Error should mention ROOT_URL",
            webAppError.getMessage().contains("ROOT_URL"));
    }

    @Test
    public void rootUrlChangingToLocalhost_callsOnError() throws Exception {
        String version = "v-localhost";
        TestBundleBuilder builder = new TestBundleBuilder(version, appId, rootUrl, compatibility)
            .addAsset("app/main.js", "js", "console.log('localhost');");

        String manifestJson = builder.buildManifestJson();
        String mainHash = builder.getAssets().get(0).hash;

        // Build index.html with ROOT_URL = localhost (but configured ROOT_URL is the server URL)
        String localhostConfig = "{\"ROOT_URL\":\"http://localhost:3000\","
            + "\"appId\":\"" + appId + "\","
            + "\"autoupdateVersionCordova\":\"" + version + "\"}";
        String localhostIndexHtml = builder.buildIndexHtmlWithConfig(localhostConfig);

        // Set the configuration ROOT_URL to a non-localhost URL
        WebAppConfiguration configuration = createConfiguration();
        configuration.setRootUrlString("http://example.com");

        server.setDispatcher(new Dispatcher() {
            @Override
            public MockResponse dispatch(RecordedRequest request) {
                String path = request.getPath();
                String cleanPath = path == null ? "" : path.split("\\?")[0];

                if ("/__cordova/manifest.json".equals(cleanPath)) {
                    return new MockResponse().setResponseCode(200).setBody(manifestJson);
                }
                if ("/__cordova/".equals(cleanPath)) {
                    return new MockResponse().setResponseCode(200).setBody(localhostIndexHtml);
                }
                if ("/__cordova/app/main.js".equals(cleanPath)) {
                    return new MockResponse()
                        .setResponseCode(200)
                        .addHeader("ETag", "\"" + mainHash + "\"")
                        .setBody("console.log('localhost');");
                }
                return new MockResponse().setResponseCode(404);
            }
        });

        AssetBundle initialBundle = createInitialBundle();
        AssetBundleManager manager = new AssetBundleManager(context, configuration, versionsDirectory, initialBundle);

        CountDownLatch latch = new CountDownLatch(1);
        AtomicReference<AssetBundle> downloaded = new AtomicReference<>();
        AtomicReference<Throwable> failure = new AtomicReference<>();

        manager.setCallback(new AssetBundleManager.Callback() {
            @Override
            public boolean shouldDownloadBundleForManifest(AssetManifest manifest) {
                return true;
            }

            @Override
            public void onFinishedDownloadingAssetBundle(AssetBundle assetBundle) {
                downloaded.set(assetBundle);
                latch.countDown();
            }

            @Override
            public void onError(Throwable cause) {
                failure.set(cause);
                latch.countDown();
            }
        });

        URL baseUrl = server.url("/__cordova/").url();
        manager.checkForUpdates(baseUrl);

        assertTrue("Timed out", latch.await(30, TimeUnit.SECONDS));
        manager.shutdown();

        assertNull("Should not have downloaded successfully", downloaded.get());
        WebAppError webAppError = assertWebAppErrorOfType(failure.get(), WebAppError.Type.UNSUITABLE_ASSET_BUNDLE);
        // Secondary: verify message mentions specific detail.
        assertTrue("Error should mention localhost",
            webAppError.getMessage().contains("localhost"));
    }

    @Test
    public void missingAppIdInIndexPage_callsOnError() throws Exception {
        String version = "v-no-appid";
        TestBundleBuilder builder = new TestBundleBuilder(version, appId, rootUrl, compatibility)
            .addAsset("app/main.js", "js", "console.log('no appid');");

        String manifestJson = builder.buildManifestJson();
        String mainHash = builder.getAssets().get(0).hash;

        // Build index.html WITHOUT appId
        String noAppIdConfig = "{\"ROOT_URL\":\"" + rootUrl + "\","
            + "\"autoupdateVersionCordova\":\"" + version + "\"}";
        String noAppIdIndexHtml = builder.buildIndexHtmlWithConfig(noAppIdConfig);

        Throwable error = runExpectingError(new Dispatcher() {
            @Override
            public MockResponse dispatch(RecordedRequest request) {
                String path = request.getPath();
                String cleanPath = path == null ? "" : path.split("\\?")[0];

                if ("/__cordova/manifest.json".equals(cleanPath)) {
                    return new MockResponse().setResponseCode(200).setBody(manifestJson);
                }
                if ("/__cordova/".equals(cleanPath)) {
                    return new MockResponse().setResponseCode(200).setBody(noAppIdIndexHtml);
                }
                if ("/__cordova/app/main.js".equals(cleanPath)) {
                    return new MockResponse()
                        .setResponseCode(200)
                        .addHeader("ETag", "\"" + mainHash + "\"")
                        .setBody("console.log('no appid');");
                }
                return new MockResponse().setResponseCode(404);
            }
        });

        WebAppError webAppError = assertWebAppErrorOfType(error, WebAppError.Type.UNSUITABLE_ASSET_BUNDLE);
        // Secondary: verify message mentions specific detail.
        assertTrue("Error should mention appId",
            webAppError.getMessage().contains("appId"));
    }

    @Test
    public void wrongAppId_callsOnError() throws Exception {
        String version = "v-wrong-appid";
        TestBundleBuilder builder = new TestBundleBuilder(version, appId, rootUrl, compatibility)
            .addAsset("app/main.js", "js", "console.log('wrong appid');");

        String manifestJson = builder.buildManifestJson();
        String mainHash = builder.getAssets().get(0).hash;

        // Build index.html with WRONG appId
        String wrongAppIdConfig = "{\"ROOT_URL\":\"" + rootUrl + "\","
            + "\"appId\":\"wrong-app-id\","
            + "\"autoupdateVersionCordova\":\"" + version + "\"}";
        String wrongAppIdIndexHtml = builder.buildIndexHtmlWithConfig(wrongAppIdConfig);

        Throwable error = runExpectingError(new Dispatcher() {
            @Override
            public MockResponse dispatch(RecordedRequest request) {
                String path = request.getPath();
                String cleanPath = path == null ? "" : path.split("\\?")[0];

                if ("/__cordova/manifest.json".equals(cleanPath)) {
                    return new MockResponse().setResponseCode(200).setBody(manifestJson);
                }
                if ("/__cordova/".equals(cleanPath)) {
                    return new MockResponse().setResponseCode(200).setBody(wrongAppIdIndexHtml);
                }
                if ("/__cordova/app/main.js".equals(cleanPath)) {
                    return new MockResponse()
                        .setResponseCode(200)
                        .addHeader("ETag", "\"" + mainHash + "\"")
                        .setBody("console.log('wrong appid');");
                }
                return new MockResponse().setResponseCode(404);
            }
        });

        WebAppError webAppError = assertWebAppErrorOfType(error, WebAppError.Type.UNSUITABLE_ASSET_BUNDLE);
        // Secondary: verify message mentions specific detail.
        assertTrue("Error should mention appId mismatch",
            webAppError.getMessage().contains("appId"));
    }

    @Test
    public void manifestDownloadFailure_callsOnError() throws Exception {
        server.setDispatcher(new Dispatcher() {
            @Override
            public MockResponse dispatch(RecordedRequest request) {
                String path = request.getPath();
                String cleanPath = path == null ? "" : path.split("\\?")[0];

                if ("/__cordova/manifest.json".equals(cleanPath)) {
                    return new MockResponse().setResponseCode(500).setBody("Internal Server Error");
                }
                return new MockResponse().setResponseCode(404);
            }
        });

        AssetBundle initialBundle = createInitialBundle();
        WebAppConfiguration configuration = createConfiguration();
        AssetBundleManager manager = new AssetBundleManager(context, configuration, versionsDirectory, initialBundle);

        CountDownLatch latch = new CountDownLatch(1);
        AtomicReference<AssetBundle> downloaded = new AtomicReference<>();
        AtomicReference<Throwable> failure = new AtomicReference<>();

        manager.setCallback(new AssetBundleManager.Callback() {
            @Override
            public boolean shouldDownloadBundleForManifest(AssetManifest manifest) {
                return true;
            }

            @Override
            public void onFinishedDownloadingAssetBundle(AssetBundle assetBundle) {
                downloaded.set(assetBundle);
                latch.countDown();
            }

            @Override
            public void onError(Throwable cause) {
                failure.set(cause);
                latch.countDown();
            }
        });

        URL baseUrl = server.url("/__cordova/").url();
        manager.checkForUpdates(baseUrl);

        assertTrue("Timed out", latch.await(30, TimeUnit.SECONDS));
        manager.shutdown();

        assertNull("Should not have downloaded successfully", downloaded.get());
        WebAppError webAppError = assertWebAppErrorOfType(failure.get(), WebAppError.Type.DOWNLOAD_FAILURE);
        // Secondary: verify message mentions specific detail.
        assertTrue("Error should mention non-success status",
            webAppError.getMessage().contains("Non-success status code") || webAppError.getMessage().contains("500"));
    }

    @Test
    public void missingSourceMap_doesNotFail() throws Exception {
        String version = "v-missing-map";
        TestBundleBuilder builder = new TestBundleBuilder(version, appId, rootUrl, compatibility)
            .addAssetWithSourceMap("app/main.js", "js", "console.log('sourcemap test');", "app/main.js.map");

        String manifestJson = builder.buildManifestJson();
        String indexHtml = builder.buildIndexHtml();
        String mainHash = builder.getAssets().get(0).hash;

        server.setDispatcher(new Dispatcher() {
            @Override
            public MockResponse dispatch(RecordedRequest request) {
                String path = request.getPath();
                String cleanPath = path == null ? "" : path.split("\\?")[0];

                if ("/__cordova/manifest.json".equals(cleanPath)) {
                    return new MockResponse().setResponseCode(200).setBody(manifestJson);
                }
                if ("/__cordova/".equals(cleanPath)) {
                    return new MockResponse().setResponseCode(200).setBody(indexHtml);
                }
                if ("/__cordova/app/main.js".equals(cleanPath)) {
                    return new MockResponse()
                        .setResponseCode(200)
                        .addHeader("ETag", "\"" + mainHash + "\"")
                        .setBody("console.log('sourcemap test');");
                }
                // Source map returns 404 — this should NOT cause an error
                return new MockResponse().setResponseCode(404);
            }
        });

        AssetBundle initialBundle = createInitialBundle();
        WebAppConfiguration configuration = createConfiguration();
        AssetBundleManager manager = new AssetBundleManager(context, configuration, versionsDirectory, initialBundle);

        CountDownLatch latch = new CountDownLatch(1);
        AtomicReference<AssetBundle> downloaded = new AtomicReference<>();
        AtomicReference<Throwable> failure = new AtomicReference<>();

        manager.setCallback(new AssetBundleManager.Callback() {
            @Override
            public boolean shouldDownloadBundleForManifest(AssetManifest manifest) {
                return true;
            }

            @Override
            public void onFinishedDownloadingAssetBundle(AssetBundle assetBundle) {
                downloaded.set(assetBundle);
                latch.countDown();
            }

            @Override
            public void onError(Throwable cause) {
                failure.set(cause);
                latch.countDown();
            }
        });

        URL baseUrl = server.url("/__cordova/").url();
        manager.checkForUpdates(baseUrl);

        assertTrue("Timed out", latch.await(30, TimeUnit.SECONDS));
        manager.shutdown();

        assertNull("Missing source map should NOT cause an error: " + failure.get(), failure.get());
        assertNotNull("Download should succeed despite missing source map", downloaded.get());
        assertEquals(version, downloaded.get().getVersion());
    }
}
