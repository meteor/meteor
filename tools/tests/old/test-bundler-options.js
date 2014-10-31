var _ = require('underscore');
var path = require('path');
var fs = require('fs');
var assert = require('assert');
var bundler = require('../../bundler.js');
var release = require('../../release.js');
var files = require('../../files.js');
var catalog = require('../../catalog.js');
var project = require('../../project.js');
var compiler = require('../../compiler.js');
var buildmessage = require('../../buildmessage.js');

// an empty app. notably this app has no .meteor/release file.
var emptyAppDir = path.join(__dirname, 'empty-app');

var lastTmpDir = null;
var tmpDir = function () {
  return (lastTmpDir = files.mkdtemp());
};

var setAppDir = function (appDir) {
  project.project.setRootDir(appDir);

  if (files.usesWarehouse()) {
    throw Error("This old test doesn't support non-checkout");
  }
  var appPackageDir = path.join(appDir, 'packages');
  var checkoutPackageDir = path.join(
    files.getCurrentToolsDir(), 'packages');

  doOrThrow(function () {
    catalog.uniload.initialize({
      localPackageSearchDirs: [checkoutPackageDir]
    });
    catalog.complete.initialize({
      localPackageSearchDirs: [appPackageDir, checkoutPackageDir]
    });
  });
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
    return JSON.parse(fs.readFileSync(
      path.join(tmpOutputDir, "programs", "web.browser", "program.json"),
      "utf8")).manifest;
  };

  setAppDir(emptyAppDir);
  var loader;
  var messages = buildmessage.capture(function () {
    loader = project.project.getPackageLoader();
  });
  if (messages.hasMessages()) {
    throw Error("failed to get package loader: " + messages.formatMessages());
  }

  console.log("nodeModules: 'skip'");
  assert.doesNotThrow(function () {
    var tmpOutputDir = tmpDir();
    var result = bundler.bundle({
      outputPath: tmpOutputDir,
      buildOptions: { minify: true },
      packageLoader: loader
    });
    assert.strictEqual(result.errors, false, result.errors && result.errors[0]);

    // sanity check -- main.js has expected contents.
    assert.strictEqual(fs.readFileSync(path.join(tmpOutputDir, "main.js"), "utf8"),
                       bundler._mainJsContents);
    // no top level node_modules directory
    assert(!fs.existsSync(path.join(tmpOutputDir,
                                    "programs", "server", "node_modules")));
    // yes package node_modules directory
    assert(fs.lstatSync(path.join(
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

  console.log("nodeModules: 'skip', no minify");
  assert.doesNotThrow(function () {
    var tmpOutputDir = tmpDir();
    var result = bundler.bundle({
      outputPath: tmpOutputDir,
      buildOptions: { minify: false },
      packageLoader: loader
    });
    assert.strictEqual(result.errors, false);

    // sanity check -- main.js has expected contents.
    assert.strictEqual(fs.readFileSync(path.join(tmpOutputDir, "main.js"), "utf8"),
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

  console.log("includeNodeModulesSymlink");
  assert.doesNotThrow(function () {
    var tmpOutputDir = tmpDir();
    var result = bundler.bundle({
      outputPath: tmpOutputDir,
      includeNodeModulesSymlink: true,
      packageLoader: loader
    });
    assert.strictEqual(result.errors, false);

    // sanity check -- main.js has expected contents.
    assert.strictEqual(fs.readFileSync(path.join(tmpOutputDir, "main.js"), "utf8"),
                       bundler._mainJsContents);
    // node_modules directory exists and is a symlink
    assert(fs.lstatSync(path.join(tmpOutputDir, "programs", "server", "node_modules")).isSymbolicLink());
    // node_modules contains fibers
    assert(fs.existsSync(path.join(tmpOutputDir, "programs", "server", "node_modules", "fibers")));
    // package node_modules directory also a symlink
    // XXX might be breaking this
    assert(fs.lstatSync(path.join(
      tmpOutputDir, "programs", "server", "npm", "ddp", "node_modules"))
           .isSymbolicLink());
  });
};


var Fiber = require('fibers');
Fiber(function () {
  release._setCurrentForOldTest();

  try {
    runTest();
  } catch (err) {
    console.log(err.stack);
    console.log('\nBundle can be found at ' + lastTmpDir);
    process.exit(1);
  }
}).run();
