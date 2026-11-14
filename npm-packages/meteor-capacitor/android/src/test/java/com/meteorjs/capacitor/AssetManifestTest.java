package com.meteorjs.capacitor;

import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

public class AssetManifestTest {

    @Test
    public void parsesClientEntriesOnly() throws Exception {
        String manifestJson = "{"
            + "\"format\":\"web-program-pre1\","
            + "\"version\":\"v2\","
            + "\"cordovaCompatibilityVersions\":{\"android\":\"android-1\"},"
            + "\"manifest\":["
            + "{\"where\":\"server\",\"path\":\"server.js\",\"url\":\"/server.js\",\"type\":\"js\",\"cacheable\":false},"
            + "{\"where\":\"client\",\"path\":\"app.js\",\"url\":\"/app.js\",\"type\":\"js\",\"cacheable\":true,\"hash\":\"0123456789012345678901234567890123456789\"}"
            + "]"
            + "}";

        AssetManifest manifest = new AssetManifest(manifestJson);
        assertEquals("v2", manifest.version);
        assertEquals("android-1", manifest.cordovaCompatibilityVersion);
        assertEquals(1, manifest.entries.size());
        AssetManifest.Entry entry = manifest.entries.get(0);
        assertEquals("app.js", entry.filePath);
        assertEquals("/app.js", entry.urlPath);
        assertEquals("js", entry.fileType);
        assertTrue(entry.cacheable);
        assertEquals("0123456789012345678901234567890123456789", entry.hash);
        assertNull(entry.sourceMapFilePath);
        assertNull(entry.sourceMapUrlPath);
    }

    @Test
    public void throwsOnMissingVersion() {
        String manifestJson = "{"
            + "\"cordovaCompatibilityVersions\":{\"android\":\"android-1\"},"
            + "\"manifest\":[]"
            + "}";

        assertInvalidManifest(manifestJson);
    }

    @Test
    public void throwsOnIncompatibleFormat() {
        String manifestJson = "{"
            + "\"format\":\"web-program-pre2\","
            + "\"version\":\"v1\","
            + "\"cordovaCompatibilityVersions\":{\"android\":\"android-1\"},"
            + "\"manifest\":[]"
            + "}";

        assertInvalidManifest(manifestJson);
    }

    @Test
    public void throwsOnMissingCompatibilityObject() {
        String manifestJson = "{"
            + "\"version\":\"v1\","
            + "\"manifest\":[]"
            + "}";

        assertInvalidManifest(manifestJson);
    }

    @Test
    public void throwsOnMissingAndroidCompatibilityVersion() {
        String manifestJson = "{"
            + "\"version\":\"v1\","
            + "\"cordovaCompatibilityVersions\":{\"ios\":\"ios-1\"},"
            + "\"manifest\":[]"
            + "}";

        assertInvalidManifest(manifestJson);
    }

    @Test
    public void throwsOnInvalidJson() {
        String manifestJson = "{\"version\":\"v1\"";

        assertInvalidManifest(manifestJson);
    }

    private static void assertInvalidManifest(String manifestJson) {
        try {
            new AssetManifest(manifestJson);
        } catch (WebAppError error) {
            assertEquals(WebAppError.Type.INVALID_ASSET_MANIFEST, error.getType());
            return;
        }

        throw new AssertionError("Expected WebAppError for invalid manifest");
    }

    @Test
    public void parsesOptionalFieldsAsNull() throws Exception {
        String manifestJson = "{"
            + "\"version\":\"v1\","
            + "\"cordovaCompatibilityVersions\":{\"android\":\"android-1\"},"
            + "\"manifest\":[{\"where\":\"client\",\"path\":\"app.js\",\"url\":\"/app.js\",\"type\":\"js\",\"cacheable\":true}]"
            + "}";

        AssetManifest manifest = new AssetManifest(manifestJson);
        AssetManifest.Entry entry = manifest.entries.get(0);
        assertNull(entry.hash);
        assertNull(entry.sourceMapFilePath);
        assertNull(entry.sourceMapUrlPath);
    }

    @Test
    public void parsesSourceMapFieldsWhenPresent() throws Exception {
        String manifestJson = "{"
            + "\"version\":\"v3\","
            + "\"cordovaCompatibilityVersions\":{\"android\":\"android-1\"},"
            + "\"manifest\":[{"
            + "\"where\":\"client\","
            + "\"path\":\"app/main.js\","
            + "\"url\":\"/app/main.js\","
            + "\"type\":\"js\","
            + "\"cacheable\":true,"
            + "\"hash\":\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\","
            + "\"sourceMap\":\"app/main.js.map\","
            + "\"sourceMapUrl\":\"/app/main.js.map\""
            + "}]"
            + "}";

        AssetManifest manifest = new AssetManifest(manifestJson);
        assertEquals(1, manifest.entries.size());

        AssetManifest.Entry entry = manifest.entries.get(0);
        assertEquals("app/main.js", entry.filePath);
        assertEquals("/app/main.js", entry.urlPath);
        assertEquals("js", entry.fileType);
        assertTrue(entry.cacheable);
        assertEquals("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", entry.hash);
        assertEquals("app/main.js.map", entry.sourceMapFilePath);
        assertEquals("/app/main.js.map", entry.sourceMapUrlPath);
    }
}
