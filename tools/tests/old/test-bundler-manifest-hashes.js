require('../../tool-env/install-babel.js');

var assert = require('assert');
var crypto = require('crypto');
var files = require('../../fs/files');
var bundler = require('../../isobuild/bundler.js');
var isopackets = require('../../tool-env/isopackets.js');
var release = require('../../packaging/release.js');
var catalog = require('../../packaging/catalog/catalog.js');
var buildmessage = require('../../utils/buildmessage.js');
const { makeGlobalAsyncLocalStorage } = require("../../utils/fiber-helpers");
var projectContextModule = require('../../project-context.js');
var safeWatcher = require("../../fs/safe-watcher");

var lastTmpDir = null;
var tmpDir = function () {
  return (lastTmpDir = files.mkdtemp("test-bundler-manifest-hashes"));
};

var makeProjectContext = async function (appName) {
  var testAppDir = files.pathJoin(
    files.convertToStandardPath(__dirname), appName);

  var projectDir = files.mkdtemp("test-bundler-manifest-hashes-app");

  await files.cp_r(testAppDir, projectDir, {
    preserveSymlinks: true,
  });

  var projectContext = new projectContextModule.ProjectContext({
    projectDir: projectDir
  });

  await doOrThrow(async function () {
    await projectContext.prepareProjectForBuild();
  });

  return projectContext;
};

var doOrThrow = async function (f) {
  var ret;
  var messages = await buildmessage.capture(async function () {
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

var runTest = async function () {
  await catalog.official.initialize();

  console.log("Bundle app with client files containing //# sourceURL comments");

  var projectContext = await makeProjectContext("app-with-client-sourceurl");
  var tmpOutputDir = tmpDir();
  var result = await bundler.bundle({
    projectContext: projectContext,
    outputPath: tmpOutputDir,
    buildOptions: { minifyMode: 'development' }
  });

  assert.strictEqual(result.errors, false, result.errors && result.errors[0]);

  var manifest = JSON.parse(
    files.readFile(
      files.pathJoin(tmpOutputDir, "programs", "web.browser", "program.json"),
      "utf8"
    )
  ).manifest;

  var generatedItems = manifest.filter(function (item) {
    return item.type === "js" && /(^|\/)(bar|foo)\.printme\.js$/.test(item.path);
  });

  assert.strictEqual(generatedItems.length, 2);

  generatedItems.forEach(function (item) {
    var diskPath = files.pathJoin(
      tmpOutputDir,
      "programs",
      "web.browser",
      item.path
    );

    assert(files.exists(diskPath), diskPath + " should exist");

    var data = files.readFile(diskPath);
    var text = data.toString("utf8");

    assert.strictEqual(item.size, data.length,
      item.path + " manifest size should match written bytes");
    assert.strictEqual(item.sri, sha512Base64(data),
      item.path + " manifest sri should match written bytes");
    assert.strictEqual(text.includes("//# sourceURL="), false,
      item.path + " should have sourceURL comments stripped before write");
  });
};


makeGlobalAsyncLocalStorage().run(
  { name: "test-bundler-manifest-hashes.js" },
  async function () {
    if (!files.inCheckout()) {
      throw Error("This old test doesn't support non-checkout");
    }

    try {
      release.setCurrent(await release.load(null));
      await isopackets.ensureIsopacketsLoadable();
      await runTest();
    } catch (err) {
      console.log(err.stack);
      console.log("\nBundle can be found at " + lastTmpDir);
      process.exit(1);
    }

    safeWatcher.closeAllWatchers();
    process.exit(0);
  }
);
