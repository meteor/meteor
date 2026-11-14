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
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import okhttp3.mockwebserver.Dispatcher;
import okhttp3.mockwebserver.MockResponse;
import okhttp3.mockwebserver.MockWebServer;
import okhttp3.mockwebserver.RecordedRequest;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

@RunWith(AndroidJUnit4.class)
public class AssetBundleManagerRetryAndValidationTest {

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

    private static final class DownloadResult {
        final AssetBundle downloaded;
        final Throwable error;

        DownloadResult(AssetBundle downloaded, Throwable error) {
            this.downloaded = downloaded;
            this.error = error;
        }
    }

    private DownloadResult runDownload(Dispatcher dispatcher) throws Exception {
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

        assertTrue("Timed out waiting for result", latch.await(30, TimeUnit.SECONDS));
        manager.shutdown();
        return new DownloadResult(downloaded.get(), failure.get());
    }

    @Test
    public void assetHttp500_isRetriedAndEventuallySucceeds() throws Exception {
        String version = "v-retry-success";
        TestBundleBuilder builder = new TestBundleBuilder(version, appId, rootUrl, compatibility)
            .addAsset("app/main.js", "js", "console.log('retry');");

        String manifestJson = builder.buildManifestJson();
        String indexHtml = builder.buildIndexHtml();
        String hash = builder.getAssets().get(0).hash;
        AtomicInteger assetAttempts = new AtomicInteger(0);

        DownloadResult result = runDownload(new Dispatcher() {
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
                    int attempt = assetAttempts.incrementAndGet();
                    if (attempt <= 2) {
                        return new MockResponse().setResponseCode(500).setBody("retry me");
                    }
                    return new MockResponse()
                        .setResponseCode(200)
                        .addHeader("ETag", "\"" + hash + "\"")
                        .setBody("console.log('retry');");
                }
                return new MockResponse().setResponseCode(404);
            }
        });

        assertNull("Unexpected download error: " + result.error, result.error);
        assertNotNull("Expected successful downloaded bundle", result.downloaded);
        assertEquals(version, result.downloaded.getVersion());
        assertTrue("Asset should have been retried at least twice", assetAttempts.get() >= 3);
        assertTrue(new File(versionsDirectory, version + "/app/main.js").exists());
    }

    @Test
    public void invalidAssetFilePath_failsBeforeFetchingInvalidAsset() throws Exception {
        String version = "v-invalid-path";
        TestBundleBuilder builder = new TestBundleBuilder(version, appId, rootUrl, compatibility)
            .addAsset("../escape.js", "js", "console.log('bad path');");

        String manifestJson = builder.buildManifestJson();
        String indexHtml = builder.buildIndexHtml();
        AtomicInteger invalidAssetRequests = new AtomicInteger(0);

        DownloadResult result = runDownload(new Dispatcher() {
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

                if (!cleanPath.isEmpty()) {
                    invalidAssetRequests.incrementAndGet();
                }
                return new MockResponse().setResponseCode(404);
            }
        });

        assertNull("Invalid-path bundle must not finish successfully", result.downloaded);
        assertNotNull("Expected validation error for invalid asset path", result.error);
        assertTrue(
            "Error should mention invalid asset file path",
            result.error.getMessage() != null && result.error.getMessage().contains("invalid")
        );
        assertEquals("Invalid asset should not be requested from the server", 0, invalidAssetRequests.get());
        assertFalse("Path traversal file must not be created outside bundle root", new File(versionsDirectory, "escape.js").exists());
        assertFalse("Invalid version should not be persisted", new File(versionsDirectory, version).exists());
    }
}
