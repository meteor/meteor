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

var makeProjectContext = async function (appName, platforms) {
  var projectDir = files.mkdtemp("test-bundler-options");
  await files.cp_r(
    files.pathJoin(files.convertToStandardPath(__dirname), appName),
    projectDir,
    { preserveSymlinks: true },
  );
  var projectContext = new projectContextModule.ProjectContext({
    projectDir: projectDir
  });
  await doOrThrow(async function () {
    if (platforms) {
      await projectContext.readProjectMetadata();
      await projectContext.platformList.write(platforms);
    }
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

  var readManifest = function (tmpOutputDir, arch = 'web.browser') {
    return JSON.parse(files.readFile(
      files.pathJoin(tmpOutputDir, "programs", arch, "program.json"),
      "utf8")).manifest;
  };

  // an empty app. notably this app has no .meteor/release file.
  var projectContext = await makeProjectContext('empty-app');

  console.log("basic version");
  try {
    var tmpOutputDir = tmpDir();
    var result = await bundler.bundle({
      projectContext: projectContext,
      outputPath: tmpOutputDir,
      buildOptions: { minifyMode: 'production' }
    });
    assert.strictEqual(result.errors, false, result.errors && result.errors[0]);

    // sanity check -- main.js has expected contents.
    assert.strictEqual(
      files.readFile(files.pathJoin(tmpOutputDir, "main.js"), "utf8"),
      bundler._mainJsContents);
    // no top level node_modules directory
    assert(!files.exists(files.pathJoin(tmpOutputDir,
                                        "programs", "server", "node_modules")));
    // yes package node_modules directory
    assert(files.lstat(files.pathJoin(
      tmpOutputDir, "programs", "server", "npm", "node_modules", "meteor", "ddp-server"))
           .isDirectory());

    // verify that contents are minified
    var manifest = readManifest(tmpOutputDir);
    _.each(manifest, function (item) {
      if (item.type !== 'js')
        return;
      // Just a hash, and no "packages/".
      assert(/^[0-9a-f]{40,40}\.js$/.test(item.path), item.path);
    });
    assert.ok(true);
  } catch (e) {
    assert.fail("basic version test fails", e);
  }

  console.log("no minify");
  try {
    var tmpOutputDir = tmpDir();
    var result = await bundler.bundle({
      projectContext: projectContext,
      outputPath: tmpOutputDir,
      buildOptions: { minifyMode: 'development' }
    });
    assert.strictEqual(result.errors, false);

    // sanity check -- main.js has expected contents.
    assert.strictEqual(files.readFile(files.pathJoin(tmpOutputDir, "main.js"), "utf8"),
                       bundler._mainJsContents);

    // verify that contents are not minified
    var manifest = readManifest(tmpOutputDir);
    var foundMeteor = false;
    var foundTracker = false;
    _.each(manifest, function (item) {
      if (item.type !== 'js')
        return;
      // No minified hash.
      assert(!/^[0-9a-f]{40,40}\.js$/.test(item.path));
      // No tests.
      assert(!/:tests/.test(item.path));
      if (item.path === 'packages/meteor.js')
        foundMeteor = true;
      if (item.path === 'packages/tracker.js')
        foundTracker = true;
    });
    assert(foundMeteor);
    assert(foundTracker);
    assert.ok(true);
  } catch (e) {
    assert.fail("no minify test fails", e);
  }

  const transportProjectContext = await makeProjectContext('empty-app', ['android']);
  for (const [ddpTransport, hasSockJS, hasUws] of [
    [undefined, true, true],
    ['both', true, true],
    ['sockjs', true, false],
    ['uws', false, true],
  ]) {
    const transportOutputDir = tmpDir();
    const previousBuilders = Object.create(null);
    const label = `DDP transport ${ddpTransport === undefined ? 'default' : ddpTransport}`;
    console.log(label);
    const buildOptions = { buildMode: 'production', minifyMode: 'development' };
    if (ddpTransport !== undefined) {
      buildOptions.ddpTransport = ddpTransport;
    }
    const bundleOptions = {
      projectContext: transportProjectContext,
      outputPath: transportOutputDir,
      previousBuilders,
      buildOptions,
    };
    const result = await bundler.bundle(bundleOptions);
    assert.strictEqual(result.errors, false, result.errors && result.errors.formatMessages());
    if (ddpTransport === 'uws') {
      const delayedResult = await bundler.bundle({
        ...bundleOptions,
        allowDelayedClientBuilds: true,
      });
      assert.strictEqual(delayedResult.errors, false,
        delayedResult.errors && delayedResult.errors.formatMessages());
      assert.strictEqual(delayedResult.postStartupCallbacks.length, 1,
        `${label}: delayed legacy target`);
      for (const callback of delayedResult.postStartupCallbacks) {
        await doOrThrow(() => callback({
          pauseClient: async () => {},
          refreshClient: async () => {},
          runLog: { log: console.log },
        }));
      }
    }

    const serverDir = files.pathJoin(transportOutputDir, 'programs', 'server');
    const serverLoad = JSON.parse(files.readFile(
      files.pathJoin(serverDir, 'program.json'), 'utf8'
    )).load;
    for (const [provider, npmName, present] of [
      ['ddp-transport-sockjs', 'sockjs', hasSockJS],
      ['ddp-transport-uws', 'uWebSockets.js', hasUws],
    ]) {
      assert.strictEqual(
        serverLoad.some(item => item.path === `packages/${provider}.js`),
        present, `${label}: ${provider} server script`
      );
      assert.strictEqual(
        files.exists(files.pathJoin(serverDir, 'npm', 'node_modules',
          'meteor', provider, 'node_modules', npmName)),
        present, `${label}: ${provider} npm dependency`
      );
    }
    for (const arch of ['web.browser', 'web.browser.legacy', 'web.cordova']) {
      assert.strictEqual(
        readManifest(transportOutputDir, arch).some(
          item => item.type === 'js' && item.path === 'packages/ddp-transport-sockjs.js'
        ),
        hasSockJS, `${label}: SockJS client script in ${arch}`
      );
    }
  }

  if (process.platform !== "win32") { // Windows doesn't have symlinks
    console.log("includeNodeModules");

    var tmpOutputDir = tmpDir();
    var result = await bundler.bundle({
      projectContext: projectContext,
      outputPath: tmpOutputDir,
      includeNodeModules: 'symlink'
    });

    console.log("after bundler.bundle");

    assert.strictEqual(result.errors, false);

    console.log("before bundler._mainJsContents");

    // sanity check -- main.js has expected contents.
    assert.strictEqual(
      files.readFile(files.pathJoin(tmpOutputDir, "main.js"), "utf8"),
      bundler._mainJsContents
    );

    console.log("before programs/server/node_modules check");

    // node_modules directory exists and is a symlink
    assert(files.lstat(files.pathJoin(
      tmpOutputDir, "programs", "server", "node_modules"
    )).isSymbolicLink());


    console.log("before ddp-server/node_modules check")

    // package node_modules directory also a directory
    assert(files.lstat(files.pathJoin(
      tmpOutputDir, "programs", "server", "npm", "node_modules",
      "meteor", "ddp-server", "node_modules"
    )).isDirectory());

    console.log("before ddp-transport-sockjs/node_modules/sockjs check");

    // ddp-transport-sockjs/node_modules/sockjs is a symlink
    assert(files.lstat(files.pathJoin(
      tmpOutputDir, "programs", "server", "npm", "node_modules",
      "meteor", "ddp-transport-sockjs", "node_modules", "sockjs"
    )).isSymbolicLink());

    // ddp-transport-uws/node_modules/uWebSockets.js is a symlink
    assert(files.lstat(files.pathJoin(
      tmpOutputDir, "programs", "server", "npm", "node_modules",
      "meteor", "ddp-transport-uws", "node_modules", "uWebSockets.js"
    )).isSymbolicLink());
  }
};


makeGlobalAsyncLocalStorage().run(
  { name: "test-bundler-options.js" },
  async function () {
    if (!files.inCheckout()) {
      throw Error("This old test doesn't support non-checkout");
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
