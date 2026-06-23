package com.meteorjs.capacitor;

import org.junit.Test;

import java.io.ByteArrayInputStream;
import java.io.FileNotFoundException;
import java.io.InputStream;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

public class AssetBundleTest {

    private static InputStream openFromMap(Map<String, byte[]> files, String path) throws java.io.IOException {
        byte[] data = files.get(path);
        if (data == null) {
            throw new FileNotFoundException(path);
        }
        return new ByteArrayInputStream(data);
    }

    private static String buildManifest(String version, String compatibility, String[][] assets) {
        StringBuilder sb = new StringBuilder();
        sb.append("{\"version\":\"").append(version).append("\",");
        sb.append("\"cordovaCompatibilityVersions\":{\"android\":\"").append(compatibility).append("\"},");
        sb.append("\"manifest\":[");

        for (int i = 0; i < assets.length; i++) {
            String[] asset = assets[i];
            // asset: [path, type, hash, cacheable]
            if (i > 0) sb.append(",");
            sb.append("{\"where\":\"client\",");
            sb.append("\"path\":\"").append(asset[0]).append("\",");
            sb.append("\"url\":\"/").append(asset[0]).append("\",");
            sb.append("\"type\":\"").append(asset[1]).append("\",");
            sb.append("\"cacheable\":").append(asset[3]).append(",");
            sb.append("\"hash\":\"").append(asset[2]).append("\"");
            sb.append("}");
        }

        sb.append("]}");
        return sb.toString();
    }

    private static String buildIndexHtml(String appId, String rootUrl, String version) {
        try {
            String runtimeConfig = "{\"ROOT_URL\":\"" + rootUrl + "\","
                + "\"appId\":\"" + appId + "\","
                + "\"autoupdateVersionCordova\":\"" + version + "\"}";
            return "<html><head><script>__meteor_runtime_config__ = JSON.parse(decodeURIComponent(\""
                + URLEncoder.encode(runtimeConfig, "UTF-8")
                + "\"))</script></head><body></body></html>";
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    @Test
    public void fromReader_parsesVersionAndAssets() throws Exception {
        String version = "v-parse-test";
        String compatibility = "android-1";

        String manifest = buildManifest(version, compatibility, new String[][] {
            {"app/main.js", "js", "abc123abc123abc123abc123abc123abc123abc1", "true"},
            {"app/style.css", "css", "def456def456def456def456def456def456def4", "true"}
        });
        String indexHtml = buildIndexHtml("test-app", "http://localhost:3000", version);

        Map<String, byte[]> files = new HashMap<>();
        files.put("program.json", manifest.getBytes(StandardCharsets.UTF_8));
        files.put("index.html", indexHtml.getBytes(StandardCharsets.UTF_8));
        files.put("app/main.js", "console.log('main');".getBytes(StandardCharsets.UTF_8));
        files.put("app/style.css", "body{}".getBytes(StandardCharsets.UTF_8));

        AssetBundle bundle = AssetBundle.fromReader("test", path -> openFromMap(files, path), null);

        assertEquals(version, bundle.getVersion());
        assertEquals(compatibility, bundle.getCordovaCompatibilityVersion());
        assertNotNull("main.js should be in bundle", bundle.assetForUrlPath("/app/main.js"));
        assertNotNull("style.css should be in bundle", bundle.assetForUrlPath("/app/style.css"));
        assertNotNull("index file should be set", bundle.getIndexFile());
    }

    @Test
    public void assetForUrlPath_fallsBackToParent() throws Exception {
        String parentVersion = "v-parent";
        String childVersion = "v-child";
        String compatibility = "android-1";

        // Parent has both main.js and shared.js
        String parentManifest = buildManifest(parentVersion, compatibility, new String[][] {
            {"app/main.js", "js", "aaa111aaa111aaa111aaa111aaa111aaa111aaa1", "true"},
            {"app/shared.js", "js", "bbb222bbb222bbb222bbb222bbb222bbb222bbb2", "true"}
        });

        Map<String, byte[]> parentFiles = new HashMap<>();
        parentFiles.put("program.json", parentManifest.getBytes(StandardCharsets.UTF_8));
        parentFiles.put("index.html", buildIndexHtml("test-app", "http://localhost:3000", parentVersion).getBytes(StandardCharsets.UTF_8));
        parentFiles.put("app/main.js", "// parent main".getBytes(StandardCharsets.UTF_8));
        parentFiles.put("app/shared.js", "// shared".getBytes(StandardCharsets.UTF_8));

        AssetBundle parent = AssetBundle.fromReader("parent", path -> openFromMap(parentFiles, path), null);

        // Child only has main.js with a different hash — shared.js has same hash so should be in parent
        String childManifest = buildManifest(childVersion, compatibility, new String[][] {
            {"app/main.js", "js", "ccc333ccc333ccc333ccc333ccc333ccc333ccc3", "true"},
            {"app/shared.js", "js", "bbb222bbb222bbb222bbb222bbb222bbb222bbb2", "true"}
        });

        Map<String, byte[]> childFiles = new HashMap<>();
        childFiles.put("program.json", childManifest.getBytes(StandardCharsets.UTF_8));
        childFiles.put("index.html", buildIndexHtml("test-app", "http://localhost:3000", childVersion).getBytes(StandardCharsets.UTF_8));
        childFiles.put("app/main.js", "// child main".getBytes(StandardCharsets.UTF_8));

        AssetBundle child = AssetBundle.fromReader("child", path -> openFromMap(childFiles, path), parent);

        // Child's own asset
        assertNotNull("child should have main.js", child.assetForUrlPath("/app/main.js"));

        // shared.js should be resolved via parent (same hash means it stays in parent)
        Asset shared = child.assetForUrlPath("/app/shared.js");
        assertNotNull("shared.js should be accessible via parent fallback", shared);
    }

    @Test
    public void cachedAssetForUrlPath_matchesHash() throws Exception {
        String version = "v-hash-match";
        String hash = "aaa111aaa111aaa111aaa111aaa111aaa111aaa1";

        String manifest = buildManifest(version, "android-1", new String[][] {
            {"app/main.js", "js", hash, "true"}
        });

        Map<String, byte[]> files = new HashMap<>();
        files.put("program.json", manifest.getBytes(StandardCharsets.UTF_8));
        files.put("index.html", buildIndexHtml("test-app", "http://localhost:3000", version).getBytes(StandardCharsets.UTF_8));
        files.put("app/main.js", "// main".getBytes(StandardCharsets.UTF_8));

        AssetBundle bundle = AssetBundle.fromReader("test", path -> openFromMap(files, path), null);

        // Same hash should return the asset
        Asset matched = bundle.cachedAssetForUrlPath("/app/main.js", hash);
        assertNotNull("Should match asset with correct hash", matched);

        // Different hash should return null
        Asset unmatched = bundle.cachedAssetForUrlPath("/app/main.js", "zzz999zzz999zzz999zzz999zzz999zzz999zzz9");
        assertNull("Should not match asset with wrong hash", unmatched);
    }

    @Test
    public void cachedAssetForUrlPath_cacheableWithoutHash() throws Exception {
        String version = "v-cacheable-no-hash";
        String hash = "aaa111aaa111aaa111aaa111aaa111aaa111aaa1";

        String manifest = buildManifest(version, "android-1", new String[][] {
            {"app/main.js", "js", hash, "true"}
        });

        Map<String, byte[]> files = new HashMap<>();
        files.put("program.json", manifest.getBytes(StandardCharsets.UTF_8));
        files.put("index.html", buildIndexHtml("test-app", "http://localhost:3000", version).getBytes(StandardCharsets.UTF_8));
        files.put("app/main.js", "// main".getBytes(StandardCharsets.UTF_8));

        AssetBundle bundle = AssetBundle.fromReader("test", path -> openFromMap(files, path), null);

        // Cacheable asset with null expectedHash should be returned
        Asset cached = bundle.cachedAssetForUrlPath("/app/main.js", null);
        assertNotNull("Cacheable asset should match without explicit hash", cached);
    }

    @Test
    public void getRuntimeConfig_parsesFromIndexHtml() throws Exception {
        String version = "v-runtime-config";
        String appId = "my-app-id";
        String rootUrl = "http://example.com";

        String manifest = buildManifest(version, "android-1", new String[][] {});
        String indexHtml = buildIndexHtml(appId, rootUrl, version);

        Map<String, byte[]> files = new HashMap<>();
        files.put("program.json", manifest.getBytes(StandardCharsets.UTF_8));
        files.put("index.html", indexHtml.getBytes(StandardCharsets.UTF_8));

        AssetBundle bundle = AssetBundle.fromReader("test", path -> openFromMap(files, path), null);

        AssetBundle.RuntimeConfig config = bundle.getRuntimeConfig();
        assertNotNull("RuntimeConfig should not be null", config);
        assertEquals(appId, config.getAppId());
        assertEquals(rootUrl, config.getRootUrlString());
        assertEquals(version, config.getAutoupdateVersionCordova());
    }

    @Test
    public void getRuntimeConfig_throwsWhenRuntimeScriptMissing() throws Exception {
        String version = "v-runtime-missing";
        String manifest = buildManifest(version, "android-1", new String[][] {});

        Map<String, byte[]> files = new HashMap<>();
        files.put("program.json", manifest.getBytes(StandardCharsets.UTF_8));
        files.put("index.html", "<html><head></head><body></body></html>".getBytes(StandardCharsets.UTF_8));

        AssetBundle bundle = AssetBundle.fromReader("test", path -> openFromMap(files, path), null);

        try {
            bundle.getRuntimeConfig();
        } catch (WebAppError error) {
            assertEquals(WebAppError.Type.UNSUITABLE_ASSET_BUNDLE, error.getType());
            return;
        }

        throw new AssertionError("Expected getRuntimeConfig to fail without runtime config script");
    }

    @Test
    public void fromReader_normalizesManifestUrlQueryString() throws Exception {
        String version = "v-query-normalize";
        String compatibility = "android-1";
        String hash = "abc123abc123abc123abc123abc123abc123abc1";

        String manifest = "{"
            + "\"version\":\"" + version + "\","
            + "\"cordovaCompatibilityVersions\":{\"android\":\"" + compatibility + "\"},"
            + "\"manifest\":[{"
            + "\"where\":\"client\","
            + "\"path\":\"app/main.js\","
            + "\"url\":\"/app/main.js?cache_bust=123\","
            + "\"type\":\"js\","
            + "\"cacheable\":true,"
            + "\"hash\":\"" + hash + "\""
            + "}]"
            + "}";

        Map<String, byte[]> files = new HashMap<>();
        files.put("program.json", manifest.getBytes(StandardCharsets.UTF_8));
        files.put("index.html", buildIndexHtml("test-app", "http://localhost:3000", version).getBytes(StandardCharsets.UTF_8));
        files.put("app/main.js", "console.log('query');".getBytes(StandardCharsets.UTF_8));

        AssetBundle bundle = AssetBundle.fromReader("test", path -> openFromMap(files, path), null);

        assertNotNull("Asset should be addressable by normalized URL path", bundle.assetForUrlPath("/app/main.js"));
        assertNull("Original query-string URL should not remain as key", bundle.assetForUrlPath("/app/main.js?cache_bust=123"));
        assertTrue("Bundle should include normalized URL in own assets", bundle.getOwnAssetsByUrlPath().containsKey("/app/main.js"));
    }
}
