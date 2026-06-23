import CryptoKit
import Foundation

@testable import MeteorjsCapacitor

/// Builder to eliminate boilerplate when constructing manifests, index HTML,
/// MockURLProtocol routes, and on-disk fixture bundles for tests.
/// Swift equivalent of the Android `TestBundleBuilder.java`.
final class TestBundleBuilder {

    struct AssetEntry {
        let path: String
        let type: String
        let content: String
        let hash: String
        let cacheable: Bool
        let sourceMapPath: String?
    }

    let version: String
    let appId: String
    let rootUrl: String
    let compatibility: String
    private(set) var assets: [AssetEntry] = []

    init(version: String, appId: String, rootUrl: String, compatibility: String) {
        self.version = version
        self.appId = appId
        self.rootUrl = rootUrl
        self.compatibility = compatibility
    }

    // MARK: - Asset registration

    @discardableResult
    func addAsset(_ path: String, type: String, content: String) -> TestBundleBuilder {
        let hash = Self.sha1Hex(content)
        assets.append(AssetEntry(path: path, type: type, content: content, hash: hash, cacheable: true, sourceMapPath: nil))
        return self
    }

    @discardableResult
    func addAsset(_ path: String, type: String, content: String, hash: String) -> TestBundleBuilder {
        assets.append(AssetEntry(path: path, type: type, content: content, hash: hash, cacheable: true, sourceMapPath: nil))
        return self
    }

    @discardableResult
    func addAssetWithSourceMap(_ path: String, type: String, content: String, sourceMapPath: String) -> TestBundleBuilder {
        let hash = Self.sha1Hex(content)
        assets.append(AssetEntry(path: path, type: type, content: content, hash: hash, cacheable: true, sourceMapPath: sourceMapPath))
        return self
    }

    // MARK: - Manifest & index HTML generation

    func buildManifestJson() -> String {
        var sb = "{\"version\":\"\(version)\","
        sb += "\"cordovaCompatibilityVersions\":{\"ios\":\"\(compatibility)\"},"
        sb += "\"manifest\":["

        for (i, asset) in assets.enumerated() {
            if i > 0 { sb += "," }
            sb += "{\"where\":\"client\","
            sb += "\"path\":\"\(asset.path)\","
            sb += "\"url\":\"/\(asset.path)\","
            sb += "\"type\":\"\(asset.type)\","
            sb += "\"cacheable\":\(asset.cacheable),"
            sb += "\"hash\":\"\(asset.hash)\""
            if let sourceMapPath = asset.sourceMapPath {
                sb += ",\"sourceMap\":\"\(sourceMapPath)\""
                sb += ",\"sourceMapUrl\":\"/\(sourceMapPath)\""
            }
            sb += "}"
        }

        sb += "]}"
        return sb
    }

    func buildIndexHtml() -> String {
        let runtimeConfig = "{\"ROOT_URL\":\"\(rootUrl)\",\"appId\":\"\(appId)\",\"autoupdateVersionCordova\":\"\(version)\"}"
        return buildIndexHtmlWithConfig(runtimeConfig)
    }

    func buildIndexHtmlWithConfig(_ runtimeConfigJson: String) -> String {
        let encoded = runtimeConfigJson.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? runtimeConfigJson
        return "<html><head><script>__meteor_runtime_config__ = JSON.parse(decodeURIComponent(\"\(encoded)\"))</script></head><body></body></html>"
    }

    // MARK: - On-disk fixture directory

    /// Write the bundle to a directory (program.json + index.html + assets).
    func writeToDirectory(_ directoryURL: URL) throws {
        let fileManager = FileManager.default
        try fileManager.createDirectory(at: directoryURL, withIntermediateDirectories: true, attributes: nil)

        let manifestURL = directoryURL.appendingPathComponent("program.json")
        try buildManifestJson().write(to: manifestURL, atomically: true, encoding: .utf8)

        let indexURL = directoryURL.appendingPathComponent("index.html")
        try buildIndexHtml().write(to: indexURL, atomically: true, encoding: .utf8)

        for asset in assets {
            let assetURL = directoryURL.appendingPathComponent(asset.path)
            let assetDir = assetURL.deletingLastPathComponent()
            try fileManager.createDirectory(at: assetDir, withIntermediateDirectories: true, attributes: nil)
            try asset.content.write(to: assetURL, atomically: true, encoding: .utf8)
        }
    }

    /// Write only the manifest and index (no asset files) — useful for
    /// creating an initial bundle where file contents are irrelevant.
    func writeManifestAndIndex(to directoryURL: URL) throws {
        let fileManager = FileManager.default
        try fileManager.createDirectory(at: directoryURL, withIntermediateDirectories: true, attributes: nil)

        let manifestURL = directoryURL.appendingPathComponent("program.json")
        try buildManifestJson().write(to: manifestURL, atomically: true, encoding: .utf8)

        let indexURL = directoryURL.appendingPathComponent("index.html")
        try buildIndexHtml().write(to: indexURL, atomically: true, encoding: .utf8)
    }

    // MARK: - MockURLProtocol route builders

    func buildRoutes(basePath: String = "") -> [String: MockURLProtocol.MockResponse] {
        var routes: [String: MockURLProtocol.MockResponse] = [:]

        routes[basePath + "/manifest.json"] = MockURLProtocol.MockResponse(
            statusCode: 200, body: buildManifestJson())
        routes[basePath + "/"] = MockURLProtocol.MockResponse(
            statusCode: 200, body: buildIndexHtml())

        for asset in assets {
            routes[basePath + "/" + asset.path] = MockURLProtocol.MockResponse(
                statusCode: 200,
                headers: ["Etag": "\"\(asset.hash)\""],
                body: asset.content)
        }

        return routes
    }

    func buildRoutesWithCustomIndexHtml(
        _ customIndexHtml: String, basePath: String = ""
    ) -> [String: MockURLProtocol.MockResponse] {
        var routes: [String: MockURLProtocol.MockResponse] = [:]

        routes[basePath + "/manifest.json"] = MockURLProtocol.MockResponse(
            statusCode: 200, body: buildManifestJson())
        routes[basePath + "/"] = MockURLProtocol.MockResponse(
            statusCode: 200, body: customIndexHtml)

        for asset in assets {
            routes[basePath + "/" + asset.path] = MockURLProtocol.MockResponse(
                statusCode: 200,
                headers: ["Etag": "\"\(asset.hash)\""],
                body: asset.content)
        }

        return routes
    }

    // MARK: - SHA-1

    static func sha1Hex(_ input: String) -> String {
        let data = Data(input.utf8)
        let hash = Insecure.SHA1.hash(data: data)
        return hash.map { String(format: "%02x", $0) }.joined()
    }
}

// MARK: - Test delegate for AssetBundleManager

final class TestManagerDelegate: AssetBundleManagerDelegate {
    var shouldDownload = true
    var onFinish: ((AssetBundle) -> Void)?
    var onError: ((Error) -> Void)?

    func assetBundleManager(
        _ assetBundleManager: AssetBundleManager,
        shouldDownloadBundleForManifest manifest: AssetManifest
    ) -> Bool {
        return shouldDownload
    }

    func assetBundleManager(
        _ assetBundleManager: AssetBundleManager, didFinishDownloadingBundle assetBundle: AssetBundle
    ) {
        onFinish?(assetBundle)
    }

    func assetBundleManager(
        _ assetBundleManager: AssetBundleManager, didFailDownloadingBundleWithError error: Error
    ) {
        onError?(error)
    }
}
