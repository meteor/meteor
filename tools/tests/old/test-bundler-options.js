var _ = require('underscore');
var path = require('path');
var fs = require('fs');
var assert = require('assert');
var bundler = require('../../bundler.js');
var release = require('../../release.js');
var files = require('../../files.js');

// an empty app. notably this app has no .meteor/release file.
var emptyAppDir = path.join(__dirname, 'empty-app');

var lastTmpDir = null;
var tmpDir = function () {
  return (lastTmpDir = files.mkdtemp());
};

var runTest = function () {
  var readManifest = function (tmpOutputDir) {
    return JSON.parse(fs.readFileSync(
      path.join(tmpOutputDir, "programs", "client", "program.json"),
      "utf8")).manifest;
  };

  console.log("nodeModules: 'skip'");
  assert.doesNotThrow(function () {
    var tmpOutputDir = tmpDir();
    var result = bundler.bundle({
      appDir: emptyAppDir,
      outputPath: tmpOutputDir,
      nodeModulesMode: 'skip',
      buildOptions: { minify: true }
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
      tmpOutputDir, "programs", "server", "npm", "livedata"))
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
      appDir: emptyAppDir,
      outputPath: tmpOutputDir,
      nodeModulesMode: 'skip',
      buildOptions: { minify: false }
    });
    assert.strictEqual(result.errors, false);

    // sanity check -- main.js has expected contents.
    assert.strictEqual(fs.readFileSync(path.join(tmpOutputDir, "main.js"), "utf8"),
                       bundler._mainJsContents);

    // verify that contents are not minified
    var manifest = readManifest(tmpOutputDir);
    var foundMeteor = false;
    var foundDeps = false;
    _.each(manifest, function (item) {
      if (item.type !== 'js')
        return;
      // No minified hash.
      assert(!/^[0-9a-f]{40,40}\.js$/.test(item.path));
      // No tests.
      assert(!/:tests/.test(item.path));
      if (item.path === 'packages/meteor.js')
        foundMeteor = true;
      if (item.path === 'packages/deps.js')
        foundDeps = true;
    });
    assert(foundMeteor);
    assert(foundDeps);
  });

  console.log("nodeModules: 'skip', no minify, testPackages: ['meteor']");
  assert.doesNotThrow(function () {
    var tmpOutputDir = tmpDir();
    var result = bundler.bundle({
      appDir: emptyAppDir,
      outputPath: tmpOutputDir,
      nodeModulesMode: 'skip',
      buildOptions: { minify: false, testPackages: ['meteor'] }
    });
    assert.strictEqual(result.errors, false);

    // sanity check -- main.js has expected contents.
    assert.strictEqual(fs.readFileSync(path.join(tmpOutputDir, "main.js"), "utf8"),
                       bundler._mainJsContents);

    // verify that tests for the meteor package are included
    var manifest = readManifest(tmpOutputDir);
    assert(_.find(manifest, function (item) {
      return item.type === 'js' && item.path === 'packages/meteor:tests.js';
    }));
  });

  console.log("nodeModules: 'copy'");
  assert.doesNotThrow(function () {
    var tmpOutputDir = tmpDir();
    var result = bundler.bundle({
      appDir: emptyAppDir,
      outputPath: tmpOutputDir,
      nodeModulesMode: 'copy'
    });
    assert.strictEqual(result.errors, false);

    // sanity check -- main.js has expected contents.
    assert.strictEqual(fs.readFileSync(path.join(tmpOutputDir, "main.js"), "utf8"),
                       bundler._mainJsContents);
    // node_modules directory exists and is not a symlink
    assert(!fs.lstatSync(path.join(tmpOutputDir, "programs", "server", "node_modules")).isSymbolicLink());
    // node_modules contains fibers
    assert(fs.existsSync(path.join(tmpOutputDir, "programs", "server", "node_modules", "fibers")));
  });

  console.log("nodeModules: 'symlink'");
  assert.doesNotThrow(function () {
    var tmpOutputDir = tmpDir();
    var result = bundler.bundle({
      appDir: emptyAppDir,
      outputPath: tmpOutputDir,
      nodeModulesMode: 'symlink'
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
    assert(fs.lstatSync(path.join(
      tmpOutputDir, "programs", "server", "npm", "livedata", "main", "node_modules"))
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
