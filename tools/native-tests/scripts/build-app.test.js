const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("fs-extra");
const os = require("node:os");

const {
  buildMeteorBuildArgs,
  buildMeteorNpmInstallArgs,
  buildLocalCapacitorInstallArgs,
  getCapacitorAndroidDebugApkPath,
  getCapacitorBuildHcpModeForNativeTestMode,
  getCapacitorBuildWebCordovaPath,
  getCapacitorBuildCleanupPaths,
  getCapacitorProductionExcludedFiles,
  getCapacitorIosDerivedDataPath,
  getCapacitorIosWorkspacePath,
  normalizeWebProgramAssetUrls,
  readMeteorAppIdentifier,
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

test("meteor npm install args suppress audit and funding noise", () => {
  assert.deepEqual(
    buildMeteorNpmInstallArgs(),
    ["npm", "install", "--no-audit", "--no-fund"]
  );
});

test("local Capacitor install args suppress audit and funding noise", () => {
  assert.deepEqual(
    buildLocalCapacitorInstallArgs("/repo/npm-packages/meteor-capacitor"),
    [
      "install",
      "/repo/npm-packages/meteor-capacitor",
      "--save-dev",
      "--no-package-lock",
      "--no-audit",
      "--no-fund",
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

test("capacitor production sync ships program.json for HCP webapp mode", () => {
  assert.deepEqual(
    getCapacitorProductionExcludedFiles({ hcpMode: "webapp" }),
    ["head.html", "body.html"]
  );
});

test("capacitor production sync excludes program.json when HCP is disabled", () => {
  assert.deepEqual(
    getCapacitorProductionExcludedFiles({ hcpMode: "none" }),
    ["program.json", "head.html", "body.html"]
  );
});

test("native test build mode keeps HCP disabled", () => {
  assert.equal(getCapacitorBuildHcpModeForNativeTestMode("build"), "none");
});

test("native test hcp mode enables webapp HCP", () => {
  assert.equal(getCapacitorBuildHcpModeForNativeTestMode("hcp"), "webapp");
});

test("readMeteorAppIdentifier reads Meteor project id file", async () => {
  const appDir = await fs.mkdtemp(path.join(os.tmpdir(), "meteor-app-id-"));
  try {
    await fs.ensureDir(path.join(appDir, ".meteor"));
    await fs.writeFile(
      path.join(appDir, ".meteor", ".id"),
      "# comment\n\nabc123.def456\n",
      "utf8"
    );

    assert.equal(await readMeteorAppIdentifier(appDir, {}), "abc123.def456");
  } finally {
    await fs.remove(appDir);
  }
});

test("readMeteorAppIdentifier prefers APP_ID env", async () => {
  assert.equal(
    await readMeteorAppIdentifier("/tmp/missing-app", { APP_ID: "from-env" }),
    "from-env"
  );
});

test("normalizeWebProgramAssetUrls strips a configured URL prefix", () => {
  const program = normalizeWebProgramAssetUrls({
    manifest: [
      {
        path: "app.css",
        url: "/__cordova/app.css?meteor_css_resource=true",
        sourceMapUrl: "/__cordova/app.css.map",
      },
      {
        path: "image.png",
        url: "/images/image.png",
      },
    ],
  }, {
    stripPrefix: "/__cordova/",
  });

  assert.equal(program.manifest[0].url, "/app.css?meteor_css_resource=true");
  assert.equal(program.manifest[0].sourceMapUrl, "/app.css.map");
  assert.equal(program.manifest[1].url, "/images/image.png");
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
    hcpMode: "none",
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

test("renderCapacitorBuildIndexHtml normalizes raw web.cordova program versions", () => {
  const html = renderCapacitorBuildIndexHtml({
    appId: "com.example.native",
    body: "<main>Native body</main>",
    head: "<title>Native head</title>",
    mobileServerUrl: "http://192.168.1.10:3000",
    hcpMode: "webapp",
    program: {
      format: "web-program-pre1",
      manifest: [
        {
          where: "client",
          path: "app.js",
          url: "/app.js",
          type: "js",
          cacheable: true,
          hash: "abc123",
        },
      ],
    },
  });

  const encodedConfig = html.match(
    /__meteor_runtime_config__ = JSON\.parse\(decodeURIComponent\("([^"]+)"\)\);/
  )[1];
  const runtimeConfig = JSON.parse(decodeURIComponent(encodedConfig));
  const version = runtimeConfig.autoupdate.versions["web.cordova"].version;
  assert.equal(typeof version, "string");
  assert.notEqual(version, "");
});

test("renderCapacitorBuildIndexHtml injects native WebAppLocalServer bridge for HCP webapp mode", () => {
  const html = renderCapacitorBuildIndexHtml({
    appId: "com.example.native",
    body: "<main>Native body</main>",
    head: "<title>Native head</title>",
    mobileServerUrl: "http://192.168.1.10:3000",
    hcpMode: "webapp",
    program: {
      version: "v1",
      manifest: [],
    },
  });

  assert.doesNotMatch(html, /var WebAppLocalServer/);
  assert.match(html, /window\.WebAppLocalServer/);
  assert.match(html, /CapacitorMeteorWebApp/);
  assert.doesNotMatch(html, /__cordova\//);
});
