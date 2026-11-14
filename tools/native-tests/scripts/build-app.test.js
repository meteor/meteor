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
  getCapacitorIosDerivedDataPath,
  getCapacitorIosWorkspacePath,
  getCapacitorIosBuildTarget,
  validateCapacitorBuildOutput,
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

test("iOS simulator compilation selects SPM projects and preserves CocoaPods workspace builds", async () => {
  const appDir = await fs.mkdtemp(path.join(os.tmpdir(), "native-ios-target-"));
  try {
    const project = path.join(appDir, "ios", "App", "App.xcodeproj");
    await fs.ensureDir(project);
    assert.deepEqual(await getCapacitorIosBuildTarget(appDir), ["-project", project]);
    const workspace = getCapacitorIosWorkspacePath(appDir);
    await fs.ensureDir(workspace);
    assert.deepEqual(await getCapacitorIosBuildTarget(appDir), ["-workspace", workspace]);
    await fs.remove(path.join(appDir, "ios"));
    await assert.rejects(getCapacitorIosBuildTarget(appDir), /No Capacitor iOS workspace or project/);
  } finally {
    await fs.remove(appDir);
  }
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

test("native test build mode keeps HCP disabled", () => {
  assert.equal(getCapacitorBuildHcpModeForNativeTestMode("build"), "none");
});

test("native test hcp mode enables webapp HCP", () => {
  assert.equal(getCapacitorBuildHcpModeForNativeTestMode("hcp"), "webapp");
});

test("native build checks Meteor's actual URLs and synchronized assets without rewriting them", async () => {
  const appDir = await fs.mkdtemp(path.join(os.tmpdir(), "native-build-output-"));
  const rootUrl = "https://mobile.example.com/app/";
  const webIndex = path.join(appDir, "_build", "native-prod", "index.html");
  const nativeIndex = path.join(appDir, "android", "app", "src", "main", "assets", "public", "index.html");
  async function writeIndex(root) {
    const config = { ROOT_URL: root, DDP_DEFAULT_CONNECTION_URL: root };
    const html = `__meteor_runtime_config__ = JSON.parse(decodeURIComponent(${JSON.stringify(encodeURIComponent(JSON.stringify(config)))}));`;
    await fs.outputFile(webIndex, html);
    await fs.outputFile(nativeIndex, html);
    return html;
  }
  const options = { appDir, platform: "android", mobileServerUrl: rootUrl, hcpMode: "none" };
  try {
    const expected = await writeIndex(rootUrl);
    await validateCapacitorBuildOutput(options);
    assert.equal(await fs.readFile(webIndex, "utf8"), expected);
    await writeIndex("http://wrong-host:3000/");
    await assert.rejects(validateCapacitorBuildOutput(options), /ROOT_URL/);
    await writeIndex(rootUrl);
    await fs.outputFile(nativeIndex, "stale native index");
    await assert.rejects(validateCapacitorBuildOutput(options), /did not synchronize/);
    await fs.outputFile(nativeIndex, expected);
    await fs.outputJson(path.join(appDir, "_build", "native-prod", "program.json"), {});
    await validateCapacitorBuildOutput({ ...options, hcpMode: "webapp" });
    await assert.rejects(validateCapacitorBuildOutput(options), /wrong manifest/);
  } finally {
    await fs.remove(appDir);
  }
});
