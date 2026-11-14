package com.meteorjs.capacitor;

import android.content.Context;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.InputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
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
public class AssetBundleManagerPartialDownloadTest {

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

    @Test
    public void interruptedDownload_sameVersion_resumesFromPartial() throws Exception {
        String version = "v-partial-resume";

        TestBundleBuilder builder = new TestBundleBuilder(version, appId, rootUrl, compatibility)
            .addAsset("app/main.js", "js", "console.log('main');")
            .addAsset("app/extra.js", "js", "console.log('extra');");

        // Pre-populate the Downloading directory with manifest and one asset (simulating interruption)
        File downloadDir = new File(versionsDirectory, "Downloading");
        assertTrue(downloadDir.mkdirs());

        // Write manifest
        Map<String, byte[]> fileMap = builder.buildFileMap();
        File manifestFile = new File(downloadDir, "program.json");
        try (InputStream in = new ByteArrayInputStream(fileMap.get("program.json"))) {
            FileOps.copy(in, manifestFile);
        }

        // Write one of the assets (simulate partial download — main.js is present)
        File mainJsDir = new File(downloadDir, "app");
        assertTrue(mainJsDir.mkdirs());
        File mainJs = new File(mainJsDir, "main.js");
        try (InputStream in = new ByteArrayInputStream(fileMap.get("app/main.js"))) {
            FileOps.copy(in, mainJs);
        }

        // Set up server with the full version
        List<String> downloadedAssets = new ArrayList<>();
        String manifestJson = builder.buildManifestJson();
        String indexHtml = builder.buildIndexHtml();

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

                for (TestBundleBuilder.AssetEntry asset : builder.getAssets()) {
                    if (("/__cordova/" + asset.path).equals(cleanPath)) {
                        synchronized (downloadedAssets) {
                            downloadedAssets.add(asset.path);
                        }
                        return new MockResponse()
                            .setResponseCode(200)
                            .addHeader("ETag", "\"" + asset.hash + "\"")
                            .setBody(asset.content);
                    }
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
        assertNull("Unexpected error: " + failure.get(), failure.get());

        AssetBundle result = downloaded.get();
        assertNotNull(result);
        assertEquals(version, result.getVersion());

        // The Downloading directory should have been moved to PartialDownload,
        // so main.js (which was already in Downloading) should have been reused from there.
        // Only extra.js (and possibly index.html) should have been downloaded from server.
        synchronized (downloadedAssets) {
            assertFalse("main.js should not be re-downloaded (was in partial)",
                downloadedAssets.contains("app/main.js"));
            assertTrue("extra.js should be downloaded (was missing from partial)",
                downloadedAssets.contains("app/extra.js"));
        }

        // The PartialDownload directory should have been moved during the process
        File partialDir = new File(versionsDirectory, "PartialDownload");
        // After successful download, the Downloading dir is moved to the version dir.
        // PartialDownload may or may not be cleaned up, but the version dir should exist.
        File versionDir = new File(versionsDirectory, version);
        assertTrue("Version directory should exist after download", versionDir.exists());

        manager.shutdown();
    }

    @Test
    public void interruptedDownload_differentVersion_reusesMatchingAssets() throws Exception {
        String v1 = "v-partial-v1";
        String v2 = "v-partial-v2";
        String sharedContent = "/* shared across versions */";

        TestBundleBuilder v1Builder = new TestBundleBuilder(v1, appId, rootUrl, compatibility)
            .addAsset("app/shared.js", "js", sharedContent)
            .addAsset("app/v1only.js", "js", "// v1 only");

        // Pre-populate Downloading directory with v1's manifest and shared.js
        File downloadDir = new File(versionsDirectory, "Downloading");
        assertTrue(downloadDir.mkdirs());

        Map<String, byte[]> v1Files = v1Builder.buildFileMap();
        File manifestFile = new File(downloadDir, "program.json");
        try (InputStream in = new ByteArrayInputStream(v1Files.get("program.json"))) {
            FileOps.copy(in, manifestFile);
        }

        File appDir = new File(downloadDir, "app");
        assertTrue(appDir.mkdirs());
        File sharedJs = new File(appDir, "shared.js");
        try (InputStream in = new ByteArrayInputStream(v1Files.get("app/shared.js"))) {
            FileOps.copy(in, sharedJs);
        }

        // Now set up v2 on the server — same shared.js hash, new v2only.js
        TestBundleBuilder v2Builder = new TestBundleBuilder(v2, appId, rootUrl, compatibility)
            .addAsset("app/shared.js", "js", sharedContent)
            .addAsset("app/v2only.js", "js", "// v2 only");

        List<String> downloadedAssets = new ArrayList<>();
        String v2Manifest = v2Builder.buildManifestJson();
        String v2Index = v2Builder.buildIndexHtml();

        server.setDispatcher(new Dispatcher() {
            @Override
            public MockResponse dispatch(RecordedRequest request) {
                String path = request.getPath();
                String cleanPath = path == null ? "" : path.split("\\?")[0];

                if ("/__cordova/manifest.json".equals(cleanPath)) {
                    return new MockResponse().setResponseCode(200).setBody(v2Manifest);
                }
                if ("/__cordova/".equals(cleanPath)) {
                    return new MockResponse().setResponseCode(200).setBody(v2Index);
                }

                for (TestBundleBuilder.AssetEntry asset : v2Builder.getAssets()) {
                    if (("/__cordova/" + asset.path).equals(cleanPath)) {
                        synchronized (downloadedAssets) {
                            downloadedAssets.add(asset.path);
                        }
                        return new MockResponse()
                            .setResponseCode(200)
                            .addHeader("ETag", "\"" + asset.hash + "\"")
                            .setBody(asset.content);
                    }
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
        assertNull("Unexpected error: " + failure.get(), failure.get());

        AssetBundle result = downloaded.get();
        assertNotNull(result);
        assertEquals(v2, result.getVersion());

        // shared.js has the same hash in both v1 and v2, so it should be reused
        // from the partial download directory (not re-downloaded)
        synchronized (downloadedAssets) {
            assertFalse("shared.js should be reused from partial download, not re-downloaded",
                downloadedAssets.contains("app/shared.js"));
            assertTrue("v2only.js should be downloaded (new asset)",
                downloadedAssets.contains("app/v2only.js"));
        }

        manager.shutdown();
    }
}
