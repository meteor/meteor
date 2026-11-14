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
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import okhttp3.mockwebserver.MockWebServer;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

@RunWith(AndroidJUnit4.class)
public class AssetBundleManagerCleanupTest {

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

    private void downloadVersion(AssetBundleManager manager, TestBundleBuilder builder) throws Exception {
        server.setDispatcher(builder.buildDispatcher());

        CountDownLatch latch = new CountDownLatch(1);
        AtomicReference<Throwable> failure = new AtomicReference<>();

        manager.setCallback(new AssetBundleManager.Callback() {
            @Override
            public boolean shouldDownloadBundleForManifest(AssetManifest manifest) {
                return true;
            }

            @Override
            public void onFinishedDownloadingAssetBundle(AssetBundle assetBundle) {
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

        assertTrue("Download timed out for " + builder.getVersion(), latch.await(30, TimeUnit.SECONDS));
        assertNull("Unexpected error downloading " + builder.getVersion() + ": " + failure.get(), failure.get());
    }

    /**
     * Waits for the manager's single-threaded executor to drain all queued tasks.
     * Works by submitting a checkForUpdates call (which runs on the same executor)
     * and waiting for its callback — since the executor is FIFO, any tasks queued
     * before this call will have completed when the callback fires.
     */
    private void waitForExecutorDrain(AssetBundleManager manager) throws Exception {
        CountDownLatch drainLatch = new CountDownLatch(1);
        manager.setCallback(new AssetBundleManager.Callback() {
            @Override
            public boolean shouldDownloadBundleForManifest(AssetManifest manifest) {
                drainLatch.countDown();
                return false;
            }

            @Override
            public void onFinishedDownloadingAssetBundle(AssetBundle assetBundle) {
                drainLatch.countDown();
            }

            @Override
            public void onError(Throwable cause) {
                drainLatch.countDown();
            }
        });

        URL baseUrl = server.url("/__cordova/").url();
        manager.checkForUpdates(baseUrl);
        assertTrue("Executor drain timed out", drainLatch.await(10, TimeUnit.SECONDS));
    }

    @Test
    public void removeAllExcept_deletesOtherVersionDirectories() throws Exception {
        String v1 = "v-cleanup-1";
        String v2 = "v-cleanup-2";

        AssetBundle initialBundle = createInitialBundle();
        WebAppConfiguration configuration = createConfiguration();
        AssetBundleManager manager = new AssetBundleManager(context, configuration, versionsDirectory, initialBundle);

        // Download v1
        TestBundleBuilder v1Builder = new TestBundleBuilder(v1, appId, rootUrl, compatibility)
            .addAsset("app/main.js", "js", "console.log('v1');");
        downloadVersion(manager, v1Builder);

        // Download v2
        TestBundleBuilder v2Builder = new TestBundleBuilder(v2, appId, rootUrl, compatibility)
            .addAsset("app/main.js", "js", "console.log('v2');");
        downloadVersion(manager, v2Builder);

        // Verify both version directories exist
        File v1Dir = new File(versionsDirectory, v1);
        File v2Dir = new File(versionsDirectory, v2);
        assertTrue("v1 directory should exist", v1Dir.exists());
        assertTrue("v2 directory should exist", v2Dir.exists());

        // Remove all except v2, then drain executor to ensure removal completes
        manager.removeAllDownloadedAssetBundlesExceptForVersion(v2);
        waitForExecutorDrain(manager);

        assertFalse("v1 directory should be deleted", v1Dir.exists());
        assertTrue("v2 directory should be kept", v2Dir.exists());

        manager.shutdown();
    }

    @Test
    public void removeAllExcept_keepsSpecifiedVersion() throws Exception {
        String v1 = "v-keep-1";
        String v2 = "v-keep-2";

        AssetBundle initialBundle = createInitialBundle();
        WebAppConfiguration configuration = createConfiguration();
        AssetBundleManager manager = new AssetBundleManager(context, configuration, versionsDirectory, initialBundle);

        // Download v1
        TestBundleBuilder v1Builder = new TestBundleBuilder(v1, appId, rootUrl, compatibility)
            .addAsset("app/main.js", "js", "console.log('keep v1');")
            .addAsset("app/style.css", "css", "body{color:red}");
        downloadVersion(manager, v1Builder);

        // Download v2
        TestBundleBuilder v2Builder = new TestBundleBuilder(v2, appId, rootUrl, compatibility)
            .addAsset("app/main.js", "js", "console.log('keep v2');");
        downloadVersion(manager, v2Builder);

        // Remove all except v1, then drain executor to ensure removal completes
        manager.removeAllDownloadedAssetBundlesExceptForVersion(v1);
        waitForExecutorDrain(manager);

        File v1Dir = new File(versionsDirectory, v1);
        File v2Dir = new File(versionsDirectory, v2);

        assertTrue("Kept version directory should exist", v1Dir.exists());
        assertFalse("Other version directory should be deleted", v2Dir.exists());

        // Verify kept version's files are intact
        File mainJs = new File(v1Dir, "app/main.js");
        File styleCss = new File(v1Dir, "app/style.css");
        assertTrue("main.js should exist in kept version", mainJs.exists());
        assertTrue("style.css should exist in kept version", styleCss.exists());

        manager.shutdown();
    }

    @Test
    public void loadDownloadedBundles_discoversExistingVersionsOnDisk() throws Exception {
        String version = "v-discover";

        // Pre-populate a version directory with valid manifest and assets
        TestBundleBuilder builder = new TestBundleBuilder(version, appId, rootUrl, compatibility)
            .addAsset("app/main.js", "js", "console.log('discover');");

        File versionDir = new File(versionsDirectory, version);
        assertTrue(versionDir.mkdirs());

        Map<String, byte[]> fileMap = builder.buildFileMap();

        // Write program.json
        File manifestFile = new File(versionDir, "program.json");
        try (InputStream in = new ByteArrayInputStream(fileMap.get("program.json"))) {
            FileOps.copy(in, manifestFile);
        }

        // Write index.html
        File indexFile = new File(versionDir, "index.html");
        try (InputStream in = new ByteArrayInputStream(fileMap.get("index.html"))) {
            FileOps.copy(in, indexFile);
        }

        // Write app/main.js
        File appDir = new File(versionDir, "app");
        assertTrue(appDir.mkdirs());
        File mainJs = new File(appDir, "main.js");
        try (InputStream in = new ByteArrayInputStream(fileMap.get("app/main.js"))) {
            FileOps.copy(in, mainJs);
        }

        // Create a new AssetBundleManager — it should discover the version on disk
        AssetBundle initialBundle = createInitialBundle();
        WebAppConfiguration configuration = createConfiguration();
        AssetBundleManager manager = new AssetBundleManager(context, configuration, versionsDirectory, initialBundle);

        AssetBundle discovered = manager.downloadedAssetBundleWithVersion(version);
        assertNotNull("Manager should discover pre-existing version on disk", discovered);
        assertEquals(version, discovered.getVersion());

        manager.shutdown();
    }
}
