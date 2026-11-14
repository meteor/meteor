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
import java.util.Arrays;
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
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

@RunWith(AndroidJUnit4.class)
public class ShouldDownloadFilterTest {

    private MockWebServer server;
    private File versionsDirectory;
    private Context context;
    private String appId;
    private String rootUrl;
    private String compatibility;

    private interface ManifestFilter {
        boolean shouldDownloadBundleForManifest(AssetManifest manifest);
    }

    private static final class CallbackSpy {
        private final CountDownLatch callbackLatch = new CountDownLatch(1);
        private final AtomicReference<AssetBundle> downloaded = new AtomicReference<>();
        private final AtomicReference<Throwable> failure = new AtomicReference<>();
        private final AtomicInteger callbackCount = new AtomicInteger(0);

        void onFinished(AssetBundle assetBundle) {
            downloaded.set(assetBundle);
            callbackCount.incrementAndGet();
            callbackLatch.countDown();
        }

        void onError(Throwable cause) {
            failure.set(cause);
            callbackCount.incrementAndGet();
            callbackLatch.countDown();
        }

        boolean awaitCallback(long timeout, TimeUnit unit) throws InterruptedException {
            return callbackLatch.await(timeout, unit);
        }
    }

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

    private int countDownloadedVersionDirectories() {
        File[] entries = versionsDirectory.listFiles();
        if (entries == null) {
            return 0;
        }

        return (int) Arrays.stream(entries)
            .filter(File::isDirectory)
            .filter(file -> !"Downloading".equals(file.getName()))
            .filter(file -> !"PartialDownload".equals(file.getName()))
            .count();
    }

    private void setCallback(AssetBundleManager manager, ManifestFilter manifestFilter, CallbackSpy callbackSpy) {
        manager.setCallback(new AssetBundleManager.Callback() {
            @Override
            public boolean shouldDownloadBundleForManifest(AssetManifest manifest) {
                return manifestFilter.shouldDownloadBundleForManifest(manifest);
            }

            @Override
            public void onFinishedDownloadingAssetBundle(AssetBundle assetBundle) {
                callbackSpy.onFinished(assetBundle);
            }

            @Override
            public void onError(Throwable cause) {
                callbackSpy.onError(cause);
            }
        });
    }

    private void assertOnlyDrainCallbackFired(
        AssetBundleManager manager,
        URL baseUrl,
        CallbackSpy callbackSpy,
        String expectedDrainVersion
    ) throws Exception {
        manager.checkForUpdates(baseUrl); // Skip path (should not call callback)
        manager.checkForUpdates(baseUrl); // Drain path (known callback)

        assertTrue("Timed out waiting for drain callback", callbackSpy.awaitCallback(30, TimeUnit.SECONDS));
        assertNull("Drain callback should not be an error: " + callbackSpy.failure.get(), callbackSpy.failure.get());
        AssetBundle drainedBundle = callbackSpy.downloaded.get();
        assertNotNull("Drain should produce a downloaded bundle", drainedBundle);
        assertEquals("Drain callback should be for the expected version", expectedDrainVersion, drainedBundle.getVersion());
        assertEquals("Only the drain action should invoke callback", 1, callbackSpy.callbackCount.get());
    }

    @Test
    public void differentCompatibilityVersion_skipsDownload() throws Exception {
        String skippedVersion = "v-compat-skip";
        String drainVersion = "v-compat-drain";
        TestBundleBuilder skippedBuilder = new TestBundleBuilder(skippedVersion, appId, rootUrl, "android-2")
            .addAsset("app/main.js", "js", "console.log('compat skip');");
        TestBundleBuilder drainBuilder = new TestBundleBuilder(drainVersion, appId, rootUrl, compatibility)
            .addAsset("app/main.js", "js", "console.log('compat drain');");

        String skippedManifest = skippedBuilder.buildManifestJson();
        String drainManifest = drainBuilder.buildManifestJson();
        String drainIndex = drainBuilder.buildIndexHtml();
        String drainHash = drainBuilder.getAssets().get(0).hash;

        AtomicInteger manifestRequests = new AtomicInteger(0);
        AtomicInteger indexRequests = new AtomicInteger(0);
        AtomicInteger assetRequests = new AtomicInteger(0);
        server.setDispatcher(new Dispatcher() {
            @Override
            public MockResponse dispatch(RecordedRequest request) {
                String path = request.getPath();
                String cleanPath = path == null ? "" : path.split("\\?")[0];

                if ("/__cordova/manifest.json".equals(cleanPath)) {
                    int count = manifestRequests.incrementAndGet();
                    return new MockResponse().setResponseCode(200).setBody(count == 1 ? skippedManifest : drainManifest);
                }
                if ("/__cordova/".equals(cleanPath)) {
                    indexRequests.incrementAndGet();
                    return new MockResponse().setResponseCode(200).setBody(drainIndex);
                }
                if ("/__cordova/app/main.js".equals(cleanPath)) {
                    assetRequests.incrementAndGet();
                    return new MockResponse()
                        .setResponseCode(200)
                        .addHeader("ETag", "\"" + drainHash + "\"")
                        .setBody("console.log('compat drain');");
                }
                return new MockResponse().setResponseCode(404);
            }
        });

        // Initial bundle and config use "android-1"
        TestBundleBuilder initialBuilder = new TestBundleBuilder("v-initial", appId, rootUrl, compatibility);
        AssetBundle initialBundle = initialBuilder.buildAssetBundle(null);
        WebAppConfiguration configuration = createConfiguration();

        AssetBundleManager manager = new AssetBundleManager(context, configuration, versionsDirectory, initialBundle);

        CallbackSpy callbackSpy = new CallbackSpy();
        setCallback(manager, manifest -> {
                String currentCompat = configuration.getCordovaCompatibilityVersion();
                return currentCompat == null || currentCompat.equals(manifest.cordovaCompatibilityVersion);
            },
            callbackSpy
        );

        URL baseUrl = server.url("/__cordova/").url();
        assertOnlyDrainCallbackFired(manager, baseUrl, callbackSpy, drainVersion);

        assertEquals("First skipped check and drain should each fetch manifest once", 2, manifestRequests.get());
        assertEquals("Only drain should fetch index", 1, indexRequests.get());
        assertEquals("Only drain should fetch app asset", 1, assetRequests.get());
        assertEquals("Only one downloaded version should be written", 1, countDownloadedVersionDirectories());

        manager.shutdown();
    }

    @Test
    public void blacklistedVersion_skipsDownload() throws Exception {
        String skippedVersion = "v-blacklisted";
        String drainVersion = "v-blacklisted-drain";

        TestBundleBuilder skippedBuilder = new TestBundleBuilder(skippedVersion, appId, rootUrl, compatibility)
            .addAsset("app/main.js", "js", "console.log('blacklisted skip');");
        TestBundleBuilder drainBuilder = new TestBundleBuilder(drainVersion, appId, rootUrl, compatibility)
            .addAsset("app/main.js", "js", "console.log('blacklisted drain');");

        String skippedManifest = skippedBuilder.buildManifestJson();
        String drainManifest = drainBuilder.buildManifestJson();
        String drainIndex = drainBuilder.buildIndexHtml();
        String drainHash = drainBuilder.getAssets().get(0).hash;

        AtomicInteger manifestRequests = new AtomicInteger(0);
        AtomicInteger indexRequests = new AtomicInteger(0);
        AtomicInteger assetRequests = new AtomicInteger(0);
        server.setDispatcher(new Dispatcher() {
            @Override
            public MockResponse dispatch(RecordedRequest request) {
                String path = request.getPath();
                String cleanPath = path == null ? "" : path.split("\\?")[0];

                if ("/__cordova/manifest.json".equals(cleanPath)) {
                    int count = manifestRequests.incrementAndGet();
                    return new MockResponse().setResponseCode(200).setBody(count == 1 ? skippedManifest : drainManifest);
                }
                if ("/__cordova/".equals(cleanPath)) {
                    indexRequests.incrementAndGet();
                    return new MockResponse().setResponseCode(200).setBody(drainIndex);
                }
                if ("/__cordova/app/main.js".equals(cleanPath)) {
                    assetRequests.incrementAndGet();
                    return new MockResponse()
                        .setResponseCode(200)
                        .addHeader("ETag", "\"" + drainHash + "\"")
                        .setBody("console.log('blacklisted drain');");
                }
                return new MockResponse().setResponseCode(404);
            }
        });

        TestBundleBuilder initialBuilder = new TestBundleBuilder("v-initial", appId, rootUrl, compatibility);
        AssetBundle initialBundle = initialBuilder.buildAssetBundle(null);
        WebAppConfiguration configuration = createConfiguration();

        // Blacklist the version (call twice — first adds to retry, second blacklists)
        configuration.addBlacklistedVersion(skippedVersion);
        configuration.addBlacklistedVersion(skippedVersion);
        assertTrue("Version should be blacklisted", configuration.getBlacklistedVersions().contains(skippedVersion));

        AssetBundleManager manager = new AssetBundleManager(context, configuration, versionsDirectory, initialBundle);
        CallbackSpy callbackSpy = new CallbackSpy();
        setCallback(
            manager,
            manifest -> !configuration.getBlacklistedVersions().contains(manifest.version),
            callbackSpy
        );

        URL baseUrl = server.url("/__cordova/").url();
        assertOnlyDrainCallbackFired(manager, baseUrl, callbackSpy, drainVersion);

        assertEquals("First skipped check and drain should each fetch manifest once", 2, manifestRequests.get());
        assertEquals("Only drain should fetch index", 1, indexRequests.get());
        assertEquals("Only drain should fetch app asset", 1, assetRequests.get());
        assertEquals("Only one downloaded version should be written", 1, countDownloadedVersionDirectories());

        manager.shutdown();
    }

    @Test
    public void currentVersionMatchesManifest_skipsDownload() throws Exception {
        String currentVersion = "v-current-match";
        String drainVersion = "v-current-drain";
        TestBundleBuilder skippedBuilder = new TestBundleBuilder(currentVersion, appId, rootUrl, compatibility)
            .addAsset("app/main.js", "js", "console.log('current skip');");
        TestBundleBuilder drainBuilder = new TestBundleBuilder(drainVersion, appId, rootUrl, compatibility)
            .addAsset("app/main.js", "js", "console.log('current drain');");

        String skippedManifest = skippedBuilder.buildManifestJson();
        String drainManifest = drainBuilder.buildManifestJson();
        String drainIndex = drainBuilder.buildIndexHtml();
        String drainHash = drainBuilder.getAssets().get(0).hash;

        AtomicInteger manifestRequests = new AtomicInteger(0);
        AtomicInteger indexRequests = new AtomicInteger(0);
        AtomicInteger assetRequests = new AtomicInteger(0);
        server.setDispatcher(new Dispatcher() {
            @Override
            public MockResponse dispatch(RecordedRequest request) {
                String path = request.getPath();
                String cleanPath = path == null ? "" : path.split("\\?")[0];

                if ("/__cordova/manifest.json".equals(cleanPath)) {
                    int count = manifestRequests.incrementAndGet();
                    return new MockResponse().setResponseCode(200).setBody(count == 1 ? skippedManifest : drainManifest);
                }
                if ("/__cordova/".equals(cleanPath)) {
                    indexRequests.incrementAndGet();
                    return new MockResponse().setResponseCode(200).setBody(drainIndex);
                }
                if ("/__cordova/app/main.js".equals(cleanPath)) {
                    assetRequests.incrementAndGet();
                    return new MockResponse()
                        .setResponseCode(200)
                        .addHeader("ETag", "\"" + drainHash + "\"")
                        .setBody("console.log('current drain');");
                }
                return new MockResponse().setResponseCode(404);
            }
        });

        TestBundleBuilder initialBuilder = new TestBundleBuilder("v-initial", appId, rootUrl, compatibility);
        AssetBundle initialBundle = initialBuilder.buildAssetBundle(null);

        // Build a "current" bundle with the same version as server
        TestBundleBuilder currentBuilder = new TestBundleBuilder(currentVersion, appId, rootUrl, compatibility);
        AssetBundle currentBundle = currentBuilder.buildAssetBundle(null);

        WebAppConfiguration configuration = createConfiguration();

        AssetBundleManager manager = new AssetBundleManager(context, configuration, versionsDirectory, initialBundle);

        CallbackSpy callbackSpy = new CallbackSpy();
        setCallback(manager, manifest -> {
                // Simulate CapacitorMeteorWebApp logic
                if (currentBundle.getVersion().equals(manifest.version)) {
                    return false;
                }
                return true;
            },
            callbackSpy
        );

        URL baseUrl = server.url("/__cordova/").url();
        assertOnlyDrainCallbackFired(manager, baseUrl, callbackSpy, drainVersion);

        assertEquals("First skipped check and drain should each fetch manifest once", 2, manifestRequests.get());
        assertEquals("Only drain should fetch index", 1, indexRequests.get());
        assertEquals("Only drain should fetch app asset", 1, assetRequests.get());
        assertEquals("Only one downloaded version should be written", 1, countDownloadedVersionDirectories());

        manager.shutdown();
    }
}
