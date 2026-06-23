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
import java.io.FileNotFoundException;
import java.io.InputStream;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
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
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

@RunWith(AndroidJUnit4.class)
public class AssetBundleManagerInstrumentedTest {

    private MockWebServer server;
    private File versionsDirectory;

    @Before
    public void setUp() throws Exception {
        server = new MockWebServer();
        server.start();

        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        versionsDirectory = new File(context.getFilesDir(), "meteor-test-" + UUID.randomUUID());
        if (versionsDirectory.exists()) {
            FileOps.deleteRecursively(versionsDirectory);
        }
        assertTrue(versionsDirectory.mkdirs());
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

    @Test
    public void checkForUpdatesDownloadsAndStoresBundle() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();

        String version = "v-download-1";
        String compatibility = "android-1";
        String appId = "test-app-id";
        String rootUrl = server.url("/").toString();
        String hash = "0123456789012345678901234567890123456789";
        String appJs = "console.log('hello');";

        String manifestJson = "{"
            + "\"version\":\"" + version + "\","
            + "\"cordovaCompatibilityVersions\":{\"android\":\"" + compatibility + "\"},"
            + "\"manifest\":[{"
            + "\"where\":\"client\","
            + "\"path\":\"app/main.js\","
            + "\"url\":\"/app/main.js\","
            + "\"type\":\"js\","
            + "\"cacheable\":true,"
            + "\"hash\":\"" + hash + "\""
            + "}]"
            + "}";

        String runtimeConfig = "{\"ROOT_URL\":\"" + rootUrl + "\",\"appId\":\"" + appId + "\",\"autoupdateVersionCordova\":\"" + version + "\"}";
        String indexHtml = "<html><head><script>__meteor_runtime_config__ = JSON.parse(decodeURIComponent(\""
            + URLEncoder.encode(runtimeConfig, "UTF-8")
            + "\"))</script></head><body></body></html>";

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
                    return new MockResponse().setResponseCode(200).addHeader("ETag", "\"" + hash + "\"").setBody(appJs);
                }

                return new MockResponse().setResponseCode(404);
            }
        });

        String initialManifest = "{"
            + "\"version\":\"v-initial\","
            + "\"cordovaCompatibilityVersions\":{\"android\":\"" + compatibility + "\"},"
            + "\"manifest\":[]"
            + "}";

        String initialRuntimeConfig = "{\"ROOT_URL\":\"" + rootUrl + "\",\"appId\":\"" + appId + "\",\"autoupdateVersionCordova\":\"v-initial\"}";
        String initialIndex = "<html><head><script>__meteor_runtime_config__ = JSON.parse(decodeURIComponent(\""
            + URLEncoder.encode(initialRuntimeConfig, "UTF-8")
            + "\"))</script></head><body></body></html>";

        Map<String, byte[]> initialFiles = new HashMap<>();
        initialFiles.put("program.json", initialManifest.getBytes(StandardCharsets.UTF_8));
        initialFiles.put("index.html", initialIndex.getBytes(StandardCharsets.UTF_8));
        AssetBundle initialBundle = AssetBundle.fromReader("initial", path -> openFromMap(initialFiles, path), null);

        WebAppConfiguration configuration = new WebAppConfiguration(
            context.getSharedPreferences("MeteorWebApp-Test-" + UUID.randomUUID(), Context.MODE_PRIVATE)
        );
        configuration.reset();
        configuration.setAppId(appId);
        configuration.setRootUrlString(rootUrl);
        configuration.setCordovaCompatibilityVersion(compatibility);

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

        assertTrue("Timed out waiting for bundle download", latch.await(30, TimeUnit.SECONDS));
        assertNull(failure.get());

        AssetBundle downloadedBundle = downloaded.get();
        assertNotNull(downloadedBundle);
        assertEquals(version, downloadedBundle.getVersion());

        File downloadedAsset = new File(versionsDirectory, version + "/app/main.js");
        assertTrue(downloadedAsset.exists());

        manager.shutdown();
    }

    private static InputStream openFromMap(Map<String, byte[]> files, String path) throws java.io.IOException {
        byte[] data = files.get(path);
        if (data == null) {
            throw new FileNotFoundException(path);
        }
        return new ByteArrayInputStream(data);
    }
}
