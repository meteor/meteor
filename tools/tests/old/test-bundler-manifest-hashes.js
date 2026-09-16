require("../../tool-env/install-babel.js");

const assert = require("assert");
const crypto = require("crypto");
const files = require("../../fs/files");
const bundler = require("../../isobuild/bundler.js");
const isopackets = require("../../tool-env/isopackets.js");
const release = require("../../packaging/release.js");
const catalog = require("../../packaging/catalog/catalog.js");
const buildmessage = require("../../utils/buildmessage.js");
const { makeGlobalAsyncLocalStorage } = require("../../utils/fiber-helpers");
const projectContextModule = require("../../project-context.js");
const safeWatcher = require("../../fs/safe-watcher");

let lastTmpDir = null;
const tmpDir = function () {
  return (lastTmpDir = files.mkdtemp("test-bundler-manifest-hashes"));
};

const makeProjectContext = async function (appName) {
  const testAppDir = files.pathJoin(files.convertToStandardPath(__dirname), appName);

  const projectDir = files.mkdtemp("test-bundler-manifest-hashes-app");

  await files.cp_r(testAppDir, projectDir, {
    preserveSymlinks: true,
  });

  const projectContext = new projectContextModule.ProjectContext({
    projectDir: projectDir,
  });

  await doOrThrow(async function () {
    await projectContext.prepareProjectForBuild();
  });

  return projectContext;
};

const doOrThrow = async function (f) {
  let ret;
  const messages = await buildmessage.capture(async function () {
    ret = await f();
  });
  if (messages.hasMessages()) {
    throw Error(messages.formatMessages());
  }
  return ret;
};

function sha512Base64(buffer) {
  return crypto.createHash("sha512").update(buffer).digest("base64");
}

const runTest = async function () {
  await catalog.official.initialize();

  console.log("Bundle app with client files containing //# sourceURL comments");

  const projectContext = await makeProjectContext("app-with-client-sourceurl");
  const tmpOutputDir = tmpDir();
  const result = await bundler.bundle({
    projectContext: projectContext,
    outputPath: tmpOutputDir,
    buildOptions: { minifyMode: "development" },
  });

  assert.strictEqual(result.errors, false, result.errors && result.errors.formatMessages());

  const manifest = JSON.parse(
    files.readFile(files.pathJoin(tmpOutputDir, "programs", "web.browser", "program.json"), "utf8"),
  ).manifest;

  const generatedItems = manifest
    .filter(function (item) {
      return item.type === "js" || item.type === "dynamic js";
    })
    .map(function (item) {
      const diskPath = files.pathJoin(tmpOutputDir, "programs", "web.browser", item.path);
      const data = files.readFile(diskPath);

      return {
        item,
        data,
        text: data.toString("utf8"),
      };
    })
    .filter(function ({ text }) {
      return text.includes("PMC: Print out ");
    });

  assert.strictEqual(generatedItems.length, 2);

  generatedItems.forEach(function ({ item, data, text }) {
    assert.strictEqual(
      item.size,
      data.length,
      `${item.path} manifest size should match written bytes`,
    );
    assert.strictEqual(
      item.sri,
      sha512Base64(data),
      `${item.path} manifest sri should match written bytes`,
    );
    assert.strictEqual(
      text.includes("//# sourceURL="),
      false,
      `${item.path} should have sourceURL comments stripped before write`,
    );
    assert.strictEqual(
      text.includes("printme-compiler.js.map"),
      false,
      `${item.path} should have old sourceMappingURL comments stripped`,
    );

    if (text.includes("PMC: Print out foo")) {
      assert.strictEqual(item.type, "dynamic js");
      assert.strictEqual(
        (text.match(/\/\/# sourceMappingURL=/g) || []).length,
        1,
        `${item.path} should have one generated sourceMappingURL comment`,
      );
    } else {
      assert.strictEqual(item.type, "js");
      assert.strictEqual(
        text.includes("//# sourceMappingURL="),
        false,
        `${item.path} should not have a sourceMappingURL comment`,
      );
    }
  });
};

makeGlobalAsyncLocalStorage().run({ name: "test-bundler-manifest-hashes.js" }, async function () {
  if (!files.inCheckout()) {
    throw Error("This old test doesn't support non-checkout");
  }

  try {
    release.setCurrent(await release.load(null));
    await isopackets.ensureIsopacketsLoadable();
    await runTest();
  } catch (err) {
    console.log(err.stack);
    console.log(`\nBundle can be found at ${lastTmpDir}`);
    process.exit(1);
  }

  safeWatcher.closeAllWatchers();
  process.exit(0);
});
