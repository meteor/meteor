require('../../tool-env/install-babel.js');

var _ = require('underscore');
var assert = require('assert');
var bundler = require('../../isobuild/bundler.js');
var release = require('../../packaging/release.js');
var files = require('../../fs/files');
var catalog = require('../../packaging/catalog/catalog.js');
var buildmessage = require('../../utils/buildmessage.js');
var isopackets = require('../../tool-env/isopackets.js');
var projectContextModule = require('../../project-context.js');
var safeWatcher = require("../../fs/safe-watcher");
const { makeGlobalAsyncLocalStorage } = require("../../utils/fiber-helpers");

var lastTmpDir = null;
var tmpDir = function () {
  return (lastTmpDir = files.mkdtemp());
};

var makeProjectContext = async function (appName) {
  var projectDir = files.mkdtemp("test-bundler-devonly");
  await files.cp_r(
    files.pathJoin(files.convertToStandardPath(__dirname), appName),
    projectDir,
    { preserveSymlinks: true },
  );
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

var runTest = async function () {
  // As preparation, let's initialize the official catalog. It servers as our
  // data store, so we will probably need it.
  await catalog.official.initialize();

  // an empty app. notably this app has no .meteor/release file.
  var projectContext = await makeProjectContext('empty-app');

  // Define an array of devOnly dependencies to check
  const devOnlyDeps = ['babel-compiler', 'standard-minifiers'];

  console.log("testing devOnly dependencies are skipped in production build");
  try {
    // Set the current command to 'build'
    global.currentCommand = {
      name: 'build',
    };

    var tmpOutputDir = tmpDir();
    var result = await bundler.bundle({
      projectContext: projectContext,
      outputPath: tmpOutputDir,
      buildOptions: { minifyMode: 'production', buildMode: 'production' },
    });
    assert.strictEqual(result.errors, false, result.errors && result.errors[0]);

    // sanity check -- main.js has expected contents.
    assert.strictEqual(
      files.readFile(files.pathJoin(tmpOutputDir, "main.js"), "utf8"),
      bundler._mainJsContents);

    // Check that devOnly packages are not present in the bundle
    for (const dep of devOnlyDeps) {
      console.log(`Checking that ${dep} is not present in the bundle`);

      // Check in node_modules
      assert(!files.exists(files.pathJoin(
        tmpOutputDir, "programs", "server", "npm", "node_modules", "meteor", dep)),
        `${dep} should not be present in node_modules`);

      // Check in web.browser/program.json
      const programJson = JSON.parse(files.readFile(
        files.pathJoin(tmpOutputDir, "programs", "web.browser", "program.json"), "utf8"));

      // Verify the dependency is not in the manifest
      const manifest = programJson.manifest || [];
      const hasDepInManifest = manifest.some(item => 
        item.path && item.path.includes(`${dep}.js`));
      assert(!hasDepInManifest, `${dep} should not be present in web.browser/program.json`);

      // Check in npm-rebuilds.json
      const npmRebuildsJson = JSON.parse(files.readFile(
        files.pathJoin(tmpOutputDir, "programs", "server", "npm-rebuilds.json"), "utf8"));

      // Verify the dependency is not in npm-rebuilds.json
      const hasDepInRebuilds = npmRebuildsJson.some(path => 
        path.includes(dep));
      assert(!hasDepInRebuilds, `${dep} should not be present in npm-rebuilds.json`);
    }

    assert.ok(true);
  } catch (e) {
    assert.fail("devOnly dependencies test fails", e);
  }
};

makeGlobalAsyncLocalStorage().run(
  { name: "test-bundler-devonly.js" },
  async function () {
    if (!files.inCheckout()) {
      throw Error("This test doesn't support non-checkout");
    }

    release.setCurrent(await release.load(null));
    await isopackets.ensureIsopacketsLoadable();

    try {
      await runTest();
    } catch (err) {
      console.log(err.stack);
      console.log("\nBundle can be found at " + lastTmpDir);
      process.exit(1);
    }

    // Allow the process to exit normally, since optimistic file watchers
    // may be keeping the event loop busy.
    safeWatcher.closeAllWatchers();
    process.exit(0);
  }
);
