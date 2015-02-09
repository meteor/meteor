var _ = require('underscore');
var assert = require('assert');
var bundler = require('../../bundler.js');
var release = require('../../release.js');
var files = require('../../files.js');
var catalog = require('../../catalog.js');
var buildmessage = require('../../buildmessage.js');
var isopackets = require("../../isopackets.js");
var projectContextModule = require('../../project-context.js');


var lastTmpDir = null;
var tmpDir = function () {
  return (lastTmpDir = files.mkdtemp());
};

var makeProjectContext = function (appName) {
  var projectDir = files.mkdtemp("test-bundler-options");
  files.cp_r(files.pathJoin(files.convertToStandardPath(__dirname), appName),
    projectDir);
  var projectContext = new projectContextModule.ProjectContext({
    projectDir: projectDir
  });
  doOrThrow(function () {
    projectContext.prepareProjectForBuild();
  });

  return projectContext;
};

var doOrThrow = function (f) {
  var ret;
  var messages = buildmessage.capture(function () {
    ret = f();
  });
  if (messages.hasMessages()) {
    throw Error(messages.formatMessages());
  }
  return ret;
};

var runTest = function () {
  // As preparation, let's initialize the official catalog. It servers as our
  // data store, so we will probably need it.
  catalog.official.initialize();

  var readManifest = function (tmpOutputDir) {
    return JSON.parse(files.readFile(
      files.pathJoin(tmpOutputDir, "programs", "web.browser", "program.json"),
      "utf8")).manifest;
  };

  // an empty app. notably this app has no .meteor/release file.
  var projectContext = makeProjectContext('empty-app');

  console.log("basic version");
  assert.doesNotThrow(function () {
    var tmpOutputDir = tmpDir();
    var result = bundler.bundle({
      projectContext: projectContext,
      outputPath: tmpOutputDir,
      buildOptions: { minify: true }
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
      tmpOutputDir, "programs", "server", "npm", "ddp"))
           .isDirectory());

    // verify that contents are minified
    var manifest = readManifest(tmpOutputDir);
    _.each(manifest, function (item) {
      if (item.type !== 'js')
        return;
      // Just a hash, and no "packages/".
      assert(/^[0-9a-f]{40,40}\.js$/.test(item.path));
    });
  });

  console.log("no minify");
  assert.doesNotThrow(function () {
    var tmpOutputDir = tmpDir();
    var result = bundler.bundle({
      projectContext: projectContext,
      outputPath: tmpOutputDir,
      buildOptions: { minify: false }
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
  });

  if (process.platform !== "win32") { // Windows doesn't have symlinks
    console.log("includeNodeModules");
    assert.doesNotThrow(function () {
      var tmpOutputDir = tmpDir();
      var result = bundler.bundle({
        projectContext: projectContext,
        outputPath: tmpOutputDir,
        includeNodeModules: 'symlink'
      });
      assert.strictEqual(result.errors, false);

      // sanity check -- main.js has expected contents.
      assert.strictEqual(files.readFile(files.pathJoin(tmpOutputDir, "main.js"), "utf8"),
                         bundler._mainJsContents);
      // node_modules directory exists and is a symlink
      assert(files.lstat(files.pathJoin(tmpOutputDir, "programs", "server", "node_modules")).isSymbolicLink());
      // node_modules contains fibers
      assert(files.exists(files.pathJoin(tmpOutputDir, "programs", "server", "node_modules", "fibers")));
      // package node_modules directory also a symlink
      // XXX might be breaking this
      assert(files.lstat(files.pathJoin(
        tmpOutputDir, "programs", "server", "npm", "ddp", "node_modules"))
             .isSymbolicLink());
    });
  }
};


var Fiber = require('fibers');
Fiber(function () {
  if (! files.inCheckout()) {
    throw Error("This old test doesn't support non-checkout");
  }

  release.setCurrent(release.load(null));
  isopackets.ensureIsopacketsLoadable();

  try {
    runTest();
  } catch (err) {
    console.log(err.stack);
    console.log('\nBundle can be found at ' + lastTmpDir);
    process.exit(1);
  }
}).run();
