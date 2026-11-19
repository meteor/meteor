package com.meteorjs.capacitor;

import org.junit.After;
import org.junit.Test;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileNotFoundException;
import java.io.InputStream;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

public class BundleOrganizerTest {

    private final File targetDirectory = new File(System.getProperty("java.io.tmpdir"), "bundle-organizer-test-" + System.nanoTime());

    @After
    public void cleanup() {
        FileOps.deleteRecursively(targetDirectory);
    }

    @Test
    public void organizeBundleInjectsShimAndCopiesAssets() throws Exception {
        String manifest = manifestForEntry("app/main.js", "/app/main.js", "0123456789012345678901234567890123456789");
        String runtimeConfig = "{\"ROOT_URL\":\"https://example.com\",\"appId\":\"test-app\",\"autoupdateVersionCordova\":\"v1\"}";
        String indexHtml = "<html><head><script>__meteor_runtime_config__ = JSON.parse(decodeURIComponent(\""
            + URLEncoder.encode(runtimeConfig, "UTF-8")
            + "\"))</script></head><body></body></html>";

        Map<String, byte[]> files = new HashMap<>();
        files.put("program.json", manifest.getBytes(StandardCharsets.UTF_8));
        files.put("index.html", indexHtml.getBytes(StandardCharsets.UTF_8));
        files.put("app/main.js", "console.log('ok');".getBytes(StandardCharsets.UTF_8));

        AssetBundle bundle = AssetBundle.fromReader("test", path -> openFromMap(files, path), null);

        BundleOrganizer.organizeBundle(bundle, targetDirectory);

        File organizedIndex = new File(targetDirectory, "index.html");
        File organizedJs = new File(targetDirectory, "app/main.js");

        assertTrue(organizedIndex.exists());
        assertTrue(organizedJs.exists());
        String organizedIndexContent = new String(java.nio.file.Files.readAllBytes(organizedIndex.toPath()), StandardCharsets.UTF_8);
        assertTrue(organizedIndexContent.contains("window.WebAppLocalServer"));
    }

    @Test
    public void validateBundleDetectsTraversal() throws Exception {
        String manifest = manifestForEntry("../bad.js", "/../bad.js", "0123456789012345678901234567890123456789");

        Map<String, byte[]> files = new HashMap<>();
        files.put("program.json", manifest.getBytes(StandardCharsets.UTF_8));
        files.put("index.html", "<html></html>".getBytes(StandardCharsets.UTF_8));

        AssetBundle bundle = AssetBundle.fromReader("test", path -> openFromMap(files, path), null);
        List<String> errors = BundleOrganizer.validateBundleOrganization(bundle);

        assertFalse(errors.isEmpty());
        assertEquals("Expected one specific validation error", 1, errors.size());
        assertTrue("Error should include offending path", errors.get(0).contains("/../bad.js"));
        assertTrue("Error should explain traversal failure", errors.get(0).contains("path traversal"));
    }

    @Test
    public void validateBundlePassesForValidBundle() throws Exception {
        String manifest = manifestForEntry("app/main.js", "/app/main.js", "0123456789012345678901234567890123456789");

        Map<String, byte[]> files = new HashMap<>();
        files.put("program.json", manifest.getBytes(StandardCharsets.UTF_8));

        AssetBundle bundle = AssetBundle.fromReader("test", path -> openFromMap(files, path), null);
        List<String> errors = BundleOrganizer.validateBundleOrganization(bundle);

        assertTrue("Valid bundle should produce no validation errors", errors.isEmpty());
    }

    @Test
    public void assetLookupNormalizesUrlPathWithQueryString() throws Exception {
        String manifest = "{"
            + "\"version\":\"v1\","
            + "\"cordovaCompatibilityVersions\":{\"android\":\"android-1\"},"
            + "\"manifest\":[{"
            + "\"where\":\"client\","
            + "\"path\":\"app/main.js\","
            + "\"url\":\"/app/main.js?cacheBust=1\","
            + "\"type\":\"js\","
            + "\"cacheable\":true,"
            + "\"hash\":\"0123456789012345678901234567890123456789\""
            + "}]"
            + "}";

        Map<String, byte[]> files = new HashMap<>();
        files.put("program.json", manifest.getBytes(StandardCharsets.UTF_8));

        AssetBundle bundle = AssetBundle.fromReader("test", path -> openFromMap(files, path), null);
        Asset asset = bundle.assetForUrlPath("/app/main.js");

        assertNotNull("Asset should be addressable via normalized URL path", asset);
        assertEquals("app/main.js", asset.filePath);
        File targetFile = BundleOrganizer.targetFileForAsset(asset, targetDirectory);
        assertEquals(new File(targetDirectory, "app/main.js").getPath(), targetFile.getPath());
    }

    @Test
    public void organizeBundleSkipsMissingNonCriticalAsset() throws Exception {
        // Manifest references a .well-known file but the file is NOT in the map.
        // This simulates the ignoreAssetsPattern scenario where a file appears in
        // the manifest but was excluded from the APK assets.
        String manifest = "{"
            + "\"version\":\"v1\","
            + "\"cordovaCompatibilityVersions\":{\"android\":\"android-1\"},"
            + "\"manifest\":["
            + "{\"where\":\"client\",\"path\":\"app/main.js\",\"url\":\"/app/main.js\",\"type\":\"js\",\"cacheable\":true,\"hash\":\"0123456789012345678901234567890123456789\"},"
            + "{\"where\":\"client\",\"path\":\".well-known/apple-app-site-association\",\"url\":\"/.well-known/apple-app-site-association\",\"type\":\"json\",\"cacheable\":true,\"hash\":\"abcdef1234567890abcdef1234567890abcdef12\"}"
            + "]}";

        String runtimeConfig = "{\"ROOT_URL\":\"https://example.com\",\"appId\":\"test-app\",\"autoupdateVersionCordova\":\"v1\"}";
        String indexHtml = "<html><head><script>__meteor_runtime_config__ = JSON.parse(decodeURIComponent(\""
            + URLEncoder.encode(runtimeConfig, "UTF-8")
            + "\"))</script></head><body></body></html>";

        Map<String, byte[]> files = new HashMap<>();
        files.put("program.json", manifest.getBytes(StandardCharsets.UTF_8));
        files.put("index.html", indexHtml.getBytes(StandardCharsets.UTF_8));
        files.put("app/main.js", "console.log('ok');".getBytes(StandardCharsets.UTF_8));
        // Intentionally NOT adding .well-known/apple-app-site-association

        AssetBundle bundle = AssetBundle.fromReader("test", path -> openFromMap(files, path), null);

        // Should succeed — missing non-critical asset is skipped with a warning
        BundleOrganizer.organizeBundle(bundle, targetDirectory);

        assertTrue("index.html should be organized", new File(targetDirectory, "index.html").exists());
        assertTrue("main.js should be organized", new File(targetDirectory, "app/main.js").exists());
        assertFalse("missing asset should not appear", new File(targetDirectory, ".well-known/apple-app-site-association").exists());
    }

    @Test
    public void organizeBundleThrowsForMissingIndexHtml() throws Exception {
        String manifest = manifestForEntry("app/main.js", "/app/main.js", "0123456789012345678901234567890123456789");

        Map<String, byte[]> files = new HashMap<>();
        files.put("program.json", manifest.getBytes(StandardCharsets.UTF_8));
        // Intentionally NOT adding index.html — this is critical and must fail
        files.put("app/main.js", "console.log('ok');".getBytes(StandardCharsets.UTF_8));

        AssetBundle bundle = AssetBundle.fromReader("test", path -> openFromMap(files, path), null);

        WebAppError error = assertThrows(WebAppError.class, () -> BundleOrganizer.organizeBundle(bundle, targetDirectory));
        assertTrue("Error should reference index.html", error.getMessage().contains("index.html"));
    }

    @Test
    public void organizeBundleSkipsMissingSourceMap() throws Exception {
        // Manifest references a source map via sourceMap/sourceMapUrl fields
        String manifest = "{"
            + "\"version\":\"v1\","
            + "\"cordovaCompatibilityVersions\":{\"android\":\"android-1\"},"
            + "\"manifest\":[{"
            + "\"where\":\"client\","
            + "\"path\":\"app/main.js\","
            + "\"url\":\"/app/main.js\","
            + "\"type\":\"js\","
            + "\"cacheable\":true,"
            + "\"hash\":\"0123456789012345678901234567890123456789\","
            + "\"sourceMap\":\"app/main.js.map\","
            + "\"sourceMapUrl\":\"/app/main.js.map\""
            + "}]}";

        String runtimeConfig = "{\"ROOT_URL\":\"https://example.com\",\"appId\":\"test-app\",\"autoupdateVersionCordova\":\"v1\"}";
        String indexHtml = "<html><head><script>__meteor_runtime_config__ = JSON.parse(decodeURIComponent(\""
            + URLEncoder.encode(runtimeConfig, "UTF-8")
            + "\"))</script></head><body></body></html>";

        Map<String, byte[]> files = new HashMap<>();
        files.put("program.json", manifest.getBytes(StandardCharsets.UTF_8));
        files.put("index.html", indexHtml.getBytes(StandardCharsets.UTF_8));
        files.put("app/main.js", "console.log('ok');".getBytes(StandardCharsets.UTF_8));
        // Intentionally NOT adding app/main.js.map

        AssetBundle bundle = AssetBundle.fromReader("test", path -> openFromMap(files, path), null);

        // Should succeed — missing source map is skipped silently
        BundleOrganizer.organizeBundle(bundle, targetDirectory);

        assertTrue("index.html should be organized", new File(targetDirectory, "index.html").exists());
        assertTrue("main.js should be organized", new File(targetDirectory, "app/main.js").exists());
        assertFalse("source map should not appear", new File(targetDirectory, "app/main.js.map").exists());
    }

    private static InputStream openFromMap(Map<String, byte[]> files, String path) throws java.io.IOException {
        byte[] data = files.get(path);
        if (data == null) {
            throw new FileNotFoundException(path);
        }
        return new ByteArrayInputStream(data);
    }

    private static String manifestForEntry(String filePath, String urlPath, String hash) {
        return "{"
            + "\"version\":\"v1\","
            + "\"cordovaCompatibilityVersions\":{\"android\":\"android-1\"},"
            + "\"manifest\":[{"
            + "\"where\":\"client\","
            + "\"path\":\"" + filePath + "\","
            + "\"url\":\"" + urlPath + "\","
            + "\"type\":\"js\","
            + "\"cacheable\":true,"
            + "\"hash\":\"" + hash + "\""
            + "}]"
            + "}";
    }
}
