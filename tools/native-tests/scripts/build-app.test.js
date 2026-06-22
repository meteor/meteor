const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
  buildMeteorBuildArgs,
  getCapacitorAndroidDebugApkPath,
  getCapacitorBuildWebCordovaPath,
  getCapacitorBuildCleanupPaths,
  getCapacitorIosDerivedDataPath,
  getCapacitorIosWorkspacePath,
  renderCapacitorBuildIndexHtml,
} = require("./build-app");

test("buildMeteorBuildArgs builds production android directory build args", () => {
  assert.deepEqual(
    buildMeteorBuildArgs({
      buildDir: "/tmp/native-build",
      mobileServerUrl: "http://192.168.1.10:3000",
      platform: "android",
    }),
    [
      "build",
      "/tmp/native-build",
      "--directory",
      "--server",
      "http://192.168.1.10:3000",
      "--platforms=android",
    ]
  );
});

test("buildMeteorBuildArgs builds production ios directory build args", () => {
  assert.deepEqual(
    buildMeteorBuildArgs({
      buildDir: "/tmp/native-build",
      mobileServerUrl: "http://192.168.1.10:3000",
      platform: "ios",
    }),
    [
      "build",
      "/tmp/native-build",
      "--directory",
      "--server",
      "http://192.168.1.10:3000",
      "--platforms=ios",
    ]
  );
});

test("android debug APK path matches Capacitor Gradle output", () => {
  assert.equal(
    getCapacitorAndroidDebugApkPath("/tmp/app"),
    path.join("/tmp/app", "android", "app", "build", "outputs", "apk", "debug", "app-debug.apk")
  );
});

test("ios workspace path matches Capacitor generated project", () => {
  assert.equal(
    getCapacitorIosWorkspacePath("/tmp/app"),
    path.join("/tmp/app", "ios", "App", "App.xcworkspace")
  );
});

test("ios derived data path stays inside temp app", () => {
  assert.equal(
    getCapacitorIosDerivedDataPath("/tmp/app"),
    path.join("/tmp/app", "ios", "derived-data")
  );
});

test("capacitor build cleanup removes stale native-prod and web.cordova outputs", () => {
  assert.deepEqual(
    getCapacitorBuildCleanupPaths("/tmp/app"),
    [
      path.join("/tmp/app", "_build", "native-prod"),
      path.join("/tmp/app", ".meteor", "local", "build", "programs", "web.cordova"),
    ]
  );
});

test("capacitor build web.cordova path matches meteor build directory output", () => {
  assert.equal(
    getCapacitorBuildWebCordovaPath("/tmp/build-out"),
    path.join("/tmp/build-out", "bundle", "programs", "web.cordova")
  );
});

test("renderCapacitorBuildIndexHtml adapts meteor build assets for Capacitor", () => {
  const html = renderCapacitorBuildIndexHtml({
    appId: "com.example.native",
    body: "<main>Native body</main>",
    head: "<title>Native head</title>",
    mobileServerUrl: "http://192.168.1.10:3000",
    program: {
      version: "v1",
      versionRefreshable: "vr",
      versionNonRefreshable: "vn",
      versionReplaceable: "vp",
      manifest: [
        {
          path: "app.css",
          type: "css",
          where: "client",
          url: "/__cordova/app.css?meteor_css_resource=true",
        },
        {
          path: "app.js",
          type: "js",
          where: "client",
          url: "/__cordova/app.js?meteor_js_resource=true",
        },
      ],
    },
  });

  assert.match(html, /<title>Native head<\/title>/);
  assert.match(html, /<main>Native body<\/main>/);
  assert.match(html, /href="\/app\.css\?meteor_css_resource=true"/);
  assert.match(html, /src="\/app\.js\?meteor_js_resource=true"/);
  assert.doesNotMatch(html, /__cordova\//);
  assert.match(html, /var WebAppLocalServer/);

  const encodedConfig = html.match(
    /__meteor_runtime_config__ = JSON\.parse\(decodeURIComponent\("([^"]+)"\)\);/
  )[1];
  const runtimeConfig = JSON.parse(decodeURIComponent(encodedConfig));
  assert.equal(runtimeConfig.ROOT_URL, "http://192.168.1.10:3000");
  assert.equal(runtimeConfig.DDP_DEFAULT_CONNECTION_URL, "http://192.168.1.10:3000");
  assert.equal(runtimeConfig.appId, "com.example.native");
  assert.equal(runtimeConfig.autoupdate.versions["web.cordova"].version, "v1");
});
