package com.meteorjs.capacitor;

import java.io.ByteArrayInputStream;
import java.io.FileNotFoundException;
import java.io.InputStream;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import okhttp3.mockwebserver.Dispatcher;
import okhttp3.mockwebserver.MockResponse;
import okhttp3.mockwebserver.RecordedRequest;

/**
 * Builder to eliminate boilerplate when constructing manifests, index HTML,
 * MockWebServer dispatchers, and in-memory AssetBundles for tests.
 */
final class TestBundleBuilder {

    static final class AssetEntry {
        final String path;
        final String url;
        final String type;
        final String content;
        final String hash;
        final boolean cacheable;
        final String sourceMapPath;

        AssetEntry(String path, String url, String type, String content, String hash, boolean cacheable, String sourceMapPath) {
            this.path = path;
            this.url = url;
            this.type = type;
            this.content = content;
            this.hash = hash;
            this.cacheable = cacheable;
            this.sourceMapPath = sourceMapPath;
        }
    }

    private final String version;
    private final String appId;
    private final String rootUrl;
    private final String compatibility;
    private final List<AssetEntry> assets = new ArrayList<>();

    TestBundleBuilder(String version, String appId, String rootUrl, String compatibility) {
        this.version = version;
        this.appId = appId;
        this.rootUrl = rootUrl;
        this.compatibility = compatibility;
    }

    TestBundleBuilder addAsset(String path, String type, String content) {
        String hash = sha1Hex(content);
        assets.add(new AssetEntry(path, null, type, content, hash, true, null));
        return this;
    }

    TestBundleBuilder addAsset(String path, String type, String content, String hash) {
        assets.add(new AssetEntry(path, null, type, content, hash, true, null));
        return this;
    }

    TestBundleBuilder addAssetWithUrl(String filePath, String urlPath, String type, String content) {
        String hash = sha1Hex(content);
        assets.add(new AssetEntry(filePath, urlPath, type, content, hash, true, null));
        return this;
    }

    TestBundleBuilder addAssetWithSourceMap(String path, String type, String content, String sourceMapPath) {
        String hash = sha1Hex(content);
        assets.add(new AssetEntry(path, null, type, content, hash, true, sourceMapPath));
        return this;
    }

    String getVersion() {
        return version;
    }

    String buildManifestJson() {
        StringBuilder sb = new StringBuilder();
        sb.append("{\"version\":\"").append(version).append("\",");
        sb.append("\"cordovaCompatibilityVersions\":{\"android\":\"").append(compatibility).append("\"},");
        sb.append("\"manifest\":[");

        for (int i = 0; i < assets.size(); i++) {
            AssetEntry asset = assets.get(i);
            if (i > 0) sb.append(",");
            String url = asset.url != null ? asset.url : "/" + asset.path;
            sb.append("{\"where\":\"client\",");
            sb.append("\"path\":\"").append(asset.path).append("\",");
            sb.append("\"url\":\"").append(url).append("\",");
            sb.append("\"type\":\"").append(asset.type).append("\",");
            sb.append("\"cacheable\":").append(asset.cacheable).append(",");
            sb.append("\"hash\":\"").append(asset.hash).append("\"");
            if (asset.sourceMapPath != null) {
                sb.append(",\"sourceMap\":\"").append(asset.sourceMapPath).append("\"");
                sb.append(",\"sourceMapUrl\":\"/").append(asset.sourceMapPath).append("\"");
            }
            sb.append("}");
        }

        sb.append("]}");
        return sb.toString();
    }

    String buildIndexHtml() {
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

    String buildIndexHtmlWithConfig(String runtimeConfigJson) {
        try {
            return "<html><head><script>__meteor_runtime_config__ = JSON.parse(decodeURIComponent(\""
                + URLEncoder.encode(runtimeConfigJson, "UTF-8")
                + "\"))</script></head><body></body></html>";
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    Dispatcher buildDispatcher() {
        String manifestJson = buildManifestJson();
        String indexHtml = buildIndexHtml();

        Map<String, MockResponse> routes = new HashMap<>();
        routes.put("/__cordova/manifest.json", new MockResponse().setResponseCode(200).setBody(manifestJson));
        routes.put("/__cordova/", new MockResponse().setResponseCode(200).setBody(indexHtml));

        for (AssetEntry asset : assets) {
            MockResponse response = new MockResponse()
                .setResponseCode(200)
                .addHeader("ETag", "\"" + asset.hash + "\"")
                .setBody(asset.content);
            routes.put("/__cordova/" + asset.path, response);
        }

        return new Dispatcher() {
            @Override
            public MockResponse dispatch(RecordedRequest request) {
                String path = request.getPath();
                String cleanPath = path == null ? "" : path.split("\\?")[0];

                MockResponse response = routes.get(cleanPath);
                if (response != null) {
                    return response.clone();
                }

                return new MockResponse().setResponseCode(404);
            }
        };
    }

    Dispatcher buildDispatcherWithCustomIndexHtml(String customIndexHtml) {
        String manifestJson = buildManifestJson();

        Map<String, MockResponse> routes = new HashMap<>();
        routes.put("/__cordova/manifest.json", new MockResponse().setResponseCode(200).setBody(manifestJson));
        routes.put("/__cordova/", new MockResponse().setResponseCode(200).setBody(customIndexHtml));

        for (AssetEntry asset : assets) {
            MockResponse response = new MockResponse()
                .setResponseCode(200)
                .addHeader("ETag", "\"" + asset.hash + "\"")
                .setBody(asset.content);
            routes.put("/__cordova/" + asset.path, response);
        }

        return new Dispatcher() {
            @Override
            public MockResponse dispatch(RecordedRequest request) {
                String path = request.getPath();
                String cleanPath = path == null ? "" : path.split("\\?")[0];

                MockResponse response = routes.get(cleanPath);
                if (response != null) {
                    return response.clone();
                }

                return new MockResponse().setResponseCode(404);
            }
        };
    }

    Map<String, byte[]> buildFileMap() {
        Map<String, byte[]> files = new HashMap<>();
        files.put("program.json", buildManifestJson().getBytes(StandardCharsets.UTF_8));
        files.put("index.html", buildIndexHtml().getBytes(StandardCharsets.UTF_8));
        for (AssetEntry asset : assets) {
            files.put(asset.path, asset.content.getBytes(StandardCharsets.UTF_8));
        }
        return files;
    }

    AssetBundle buildAssetBundle(AssetBundle parentBundle) throws WebAppError {
        Map<String, byte[]> files = buildFileMap();
        return AssetBundle.fromReader(
            "test-" + version,
            path -> openFromMap(files, path),
            parentBundle
        );
    }

    List<AssetEntry> getAssets() {
        return assets;
    }

    static InputStream openFromMap(Map<String, byte[]> files, String path) throws java.io.IOException {
        byte[] data = files.get(path);
        if (data == null) {
            throw new FileNotFoundException(path);
        }
        return new ByteArrayInputStream(data);
    }

    private static String sha1Hex(String input) {
        try {
            java.security.MessageDigest md = java.security.MessageDigest.getInstance("SHA-1");
            byte[] digest = md.digest(input.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(40);
            for (byte b : digest) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (java.security.NoSuchAlgorithmException e) {
            throw new RuntimeException(e);
        }
    }
}
