package com.meteorjs.capacitor;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.io.File;
import java.lang.reflect.Method;
import java.net.URL;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import okhttp3.mockwebserver.MockWebServer;

@RunWith(AndroidJUnit4.class)
public class CapacitorMeteorWebAppLifecycleTest {

    private MockWebServer server;
    private Context context;
    private File versionsDirectory;
    private File servingDirectory;
    private String appId;
    private String rootUrl;
    private String compatibility;

    @Before
    public void setUp() throws Exception {
        server = new MockWebServer();
        server.start();

        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        versionsDirectory = new File(context.getFilesDir(), "meteor-app-test-" + UUID.randomUUID());
        servingDirectory = new File(context.getFilesDir(), "meteor-serving-test-" + UUID.randomUUID());
        assertTrue(versionsDirectory.mkdirs());
        assertTrue(servingDirectory.mkdirs());

        appId = "test-app-id";
        rootUrl = server.url("/").toString();
        compatibility = "android-1";
    }

    @After
    public void tearDown() throws Exception {
        if (server != null) {
            server.shutdown();
        }
        FileOps.deleteRecursively(versionsDirectory);
        FileOps.deleteRecursively(servingDirectory);
    }

    private WebAppConfiguration createConfiguration() {
        WebAppConfiguration configuration = new WebAppConfiguration(
            context.getSharedPreferences("MeteorWebApp-AppTest-" + UUID.randomUUID(), Context.MODE_PRIVATE)
        );
        configuration.reset();
        configuration.setAppId(appId);
        configuration.setRootUrlString(rootUrl);
        configuration.setCordovaCompatibilityVersion(compatibility);
        return configuration;
    }

    private AssetBundle createBundle(String version) throws Exception {
        TestBundleBuilder builder = new TestBundleBuilder(version, appId, rootUrl, compatibility)
            .addAsset("app/main.js", "js", "console.log('" + version + "');");
        return builder.buildAssetBundle(null);
    }

    private AssetBundleManager createManager(WebAppConfiguration configuration, AssetBundle initialBundle) throws Exception {
        return new AssetBundleManager(context, configuration, versionsDirectory, initialBundle);
    }

    private AssetBundle downloadVersion(AssetBundleManager manager, TestBundleBuilder builder) throws Exception {
        server.setDispatcher(builder.buildDispatcher());

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

        assertTrue("Download timed out for " + builder.getVersion(), latch.await(30, TimeUnit.SECONDS));
        assertNull("Unexpected download error: " + failure.get(), failure.get());
        return downloaded.get();
    }

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

    private static void awaitCondition(String message, long timeoutMs, Condition condition) throws Exception {
        long deadline = System.currentTimeMillis() + timeoutMs;
        while (System.currentTimeMillis() < deadline) {
            if (condition.check()) {
                return;
            }
            Thread.sleep(50);
        }
        throw new AssertionError(message);
    }

    @FunctionalInterface
    private interface Condition {
        boolean check() throws Exception;
    }

    @Test
    public void setupCurrentBundle_organizesInitialBundleByUrlPath() throws Exception {
        // Create a bundle with divergent filePath vs urlPath, mimicking real Meteor bundles
        // where filePath="app/main.js" but urlPath="/main.js"
        TestBundleBuilder builder = new TestBundleBuilder("v-initial-org", appId, rootUrl, compatibility)
            .addAssetWithUrl("app/main.js", "/main.js", "js", "console.log('organized');")
            .addAssetWithUrl("app/vite/assets/style.css", "/vite/assets/style.css", "css", "body{}");
        AssetBundle initialBundle = builder.buildAssetBundle(null);

        WebAppConfiguration configuration = createConfiguration();
        AssetBundleManager manager = createManager(configuration, initialBundle);
        ExecutorService bundleSwitchExecutor = Executors.newSingleThreadExecutor();

        // The test seam constructor calls setupCurrentBundle(), which should organize
        // the initial bundle via BundleOrganizer into the serving directory.
        CapacitorMeteorWebApp app = new CapacitorMeteorWebApp(
            context,
            new Handler(Looper.getMainLooper()),
            bundleSwitchExecutor,
            configuration,
            manager,
            initialBundle,
            initialBundle,
            versionsDirectory,
            servingDirectory
        );

        File bundleDir = new File(servingDirectory, "v-initial-org");
        assertTrue("Serving directory for bundle should exist", bundleDir.exists());

        // Files should be at their urlPath locations, NOT filePath locations
        assertTrue("main.js should be at urlPath location",
            new File(bundleDir, "main.js").exists());
        assertTrue("style.css should be at urlPath location",
            new File(bundleDir, "vite/assets/style.css").exists());
        assertFalse("main.js should NOT be at filePath location",
            new File(bundleDir, "app/main.js").exists());
        assertFalse("style.css should NOT be at filePath location",
            new File(bundleDir, "app/vite/assets/style.css").exists());

        // index.html should contain the WebAppLocalServer shim
        File indexFile = new File(bundleDir, "index.html");
        assertTrue("index.html should exist", indexFile.exists());
        String indexContent = new String(
            java.nio.file.Files.readAllBytes(indexFile.toPath()),
            java.nio.charset.StandardCharsets.UTF_8
        );
        assertTrue("index.html should contain WebAppLocalServer shim",
            indexContent.contains("WebAppLocalServer"));

        app.handleOnDestroy();
    }

    @Test
    public void startupDidComplete_marksCurrentAsGoodAndCleansOlderVersions() throws Exception {
        String v1 = "v-app-cleanup-1";
        String v2 = "v-app-cleanup-2";

        WebAppConfiguration configuration = createConfiguration();
        AssetBundle initialBundle = createBundle("v-initial");
        AssetBundleManager manager = createManager(configuration, initialBundle);

        downloadVersion(manager, new TestBundleBuilder(v1, appId, rootUrl, compatibility)
            .addAsset("app/main.js", "js", "console.log('v1');"));
        downloadVersion(manager, new TestBundleBuilder(v2, appId, rootUrl, compatibility)
            .addAsset("app/main.js", "js", "console.log('v2');"));

        AssetBundle currentBundle = manager.downloadedAssetBundleWithVersion(v2);
        ExecutorService bundleSwitchExecutor = Executors.newSingleThreadExecutor();
        CapacitorMeteorWebApp app = new CapacitorMeteorWebApp(
            context,
            new Handler(Looper.getMainLooper()),
            bundleSwitchExecutor,
            configuration,
            manager,
            initialBundle,
            currentBundle,
            versionsDirectory,
            servingDirectory
        );

        CountDownLatch callbackLatch = new CountDownLatch(1);
        AtomicReference<Throwable> callbackError = new AtomicReference<>();
        app.startupDidComplete(error -> {
            callbackError.set(error);
            callbackLatch.countDown();
        });

        assertTrue("startupDidComplete callback timed out", callbackLatch.await(5, TimeUnit.SECONDS));
        assertNull("startupDidComplete should succeed", callbackError.get());

        waitForExecutorDrain(manager);

        assertEquals(v2, configuration.getLastKnownGoodVersion());
        assertFalse(new File(versionsDirectory, v1).exists());
        assertTrue(new File(versionsDirectory, v2).exists());

        app.handleOnDestroy();
    }

    @Test
    public void onFinishedDownloadingAssetBundle_setsPendingAndEmitsUpdateEvent() throws Exception {
        String pendingVersion = "v-app-pending";

        WebAppConfiguration configuration = createConfiguration();
        AssetBundle initialBundle = createBundle("v-initial");
        AssetBundleManager manager = createManager(configuration, initialBundle);
        ExecutorService bundleSwitchExecutor = Executors.newSingleThreadExecutor();
        CapacitorMeteorWebApp app = new CapacitorMeteorWebApp(
            context,
            new Handler(Looper.getMainLooper()),
            bundleSwitchExecutor,
            configuration,
            manager,
            initialBundle,
            initialBundle,
            versionsDirectory,
            servingDirectory
        );

        CountDownLatch eventLatch = new CountDownLatch(1);
        AtomicReference<String> notifiedVersion = new AtomicReference<>();
        app.setEventCallback(new CapacitorMeteorWebApp.EventCallback() {
            @Override
            public void onUpdateAvailable(String version) {
                notifiedVersion.set(version);
                eventLatch.countDown();
            }

            @Override
            public void onError(String message) {}
        });

        AssetBundle pendingBundle = createBundle(pendingVersion);
        app.onFinishedDownloadingAssetBundle(pendingBundle);

        assertTrue("updateAvailable event timed out", eventLatch.await(5, TimeUnit.SECONDS));
        assertEquals(pendingVersion, notifiedVersion.get());
        assertEquals(pendingVersion, configuration.getLastDownloadedVersion());
        assertTrue(app.isUpdateAvailable());

        app.handleOnDestroy();
    }

    @Test
    public void reload_switchesToPendingVersion() throws Exception {
        String pendingVersion = "v-app-reload";

        WebAppConfiguration configuration = createConfiguration();
        AssetBundle initialBundle = createBundle("v-initial");
        AssetBundleManager manager = createManager(configuration, initialBundle);
        ExecutorService bundleSwitchExecutor = Executors.newSingleThreadExecutor();
        CapacitorMeteorWebApp app = new CapacitorMeteorWebApp(
            context,
            new Handler(Looper.getMainLooper()),
            bundleSwitchExecutor,
            configuration,
            manager,
            initialBundle,
            initialBundle,
            versionsDirectory,
            servingDirectory
        );

        AssetBundle pendingBundle = createBundle(pendingVersion);
        app.onFinishedDownloadingAssetBundle(pendingBundle);
        awaitCondition("Pending bundle should become available", 5000, app::isUpdateAvailable);

        CountDownLatch reloadLatch = new CountDownLatch(1);
        AtomicReference<Throwable> reloadError = new AtomicReference<>();
        app.reload(error -> {
            reloadError.set(error);
            reloadLatch.countDown();
        });

        assertTrue("reload timed out", reloadLatch.await(10, TimeUnit.SECONDS));
        assertNull("reload should succeed", reloadError.get());
        assertEquals(pendingVersion, app.getCurrentVersion());
        assertFalse(app.isUpdateAvailable());
        assertTrue(new File(servingDirectory, pendingVersion).exists());

        app.handleOnDestroy();
    }

    @Test
    public void startupTimeout_revertsToLastKnownGoodVersionAndFlagsCurrentForRetry() throws Exception {
        String v1 = "v-timeout-good";
        String v2 = "v-timeout-bad";

        WebAppConfiguration configuration = createConfiguration();
        AssetBundle initialBundle = createBundle("v-initial");
        AssetBundleManager manager = createManager(configuration, initialBundle);

        downloadVersion(manager, new TestBundleBuilder(v1, appId, rootUrl, compatibility)
            .addAsset("app/main.js", "js", "console.log('good');"));
        downloadVersion(manager, new TestBundleBuilder(v2, appId, rootUrl, compatibility)
            .addAsset("app/main.js", "js", "console.log('bad');"));

        configuration.setLastKnownGoodVersion(v1);
        AssetBundle badCurrentBundle = manager.downloadedAssetBundleWithVersion(v2);

        ExecutorService bundleSwitchExecutor = Executors.newSingleThreadExecutor();
        CapacitorMeteorWebApp app = new CapacitorMeteorWebApp(
            context,
            new Handler(Looper.getMainLooper()),
            bundleSwitchExecutor,
            configuration,
            manager,
            initialBundle,
            badCurrentBundle,
            versionsDirectory,
            servingDirectory
        );

        Method timeoutMethod = CapacitorMeteorWebApp.class.getDeclaredMethod("onStartupTimeout");
        timeoutMethod.setAccessible(true);
        timeoutMethod.invoke(app);

        awaitCondition("App should revert to last known good version", 10000, () -> v1.equals(app.getCurrentVersion()));

        assertTrue(configuration.getVersionsToRetry().contains(v2));
        assertEquals(v1, app.getCurrentVersion());
        assertFalse(app.isUpdateAvailable());

        app.handleOnDestroy();
    }
}
