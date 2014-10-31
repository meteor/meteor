var _ = require('underscore');
var path = require('path');
var fs = require('fs');
var assert = require('assert');
var Future = require('fibers/future');
var files = require('../../files.js');
var bundler = require('../../bundler.js');
var uniload = require('../../uniload.js');
var release = require('../../release.js');
var project = require('../../project.js');
var catalog = require('../../catalog.js');
var buildmessage = require('../../buildmessage.js');

var appWithPublic = path.join(__dirname, 'app-with-public');
var appWithPrivate = path.join(__dirname, 'app-with-private');

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

// These tests make some assumptions about the structure of stars: that there
// are client and server programs inside programs/.

var runTest = function () {
   // As preparation, we need to initialize the official catalog, which serves
   // as our sql data store.
   catalog.official.initialize();

  console.log("Bundle app with public/ directory");
  assert.doesNotThrow(function () {
    setAppDir(appWithPublic);

    var tmpOutputDir = tmpDir();
    var result = bundler.bundle({
      outputPath: tmpOutputDir
    });
    var clientManifest = JSON.parse(
      fs.readFileSync(
        path.join(tmpOutputDir, "programs", "web.browser", "program.json")
      )
    );

    var testCases = [["/test.txt", "Test\n"],
                     ["/nested/nested.txt", "Nested\n"]];
    _.each(testCases, function (file) {
      var manifestItem = _.find(clientManifest.manifest, function (m) {
        return m.url === file[0];
      });
      assert(manifestItem);
      var diskPath = path.join(tmpOutputDir, "programs", "web.browser",
                               manifestItem.path);
      assert(fs.existsSync(diskPath));
      assert.strictEqual(fs.readFileSync(diskPath, "utf8"), file[1]);
    });
  });

  console.log("Bundle app with private/ directory and package asset");
  assert.doesNotThrow(function () {
    setAppDir(appWithPrivate);

    // Make sure we rebuild this app package.
    files.rm_recursive(
      path.join(appWithPrivate, "packages", "test-package", ".build"));

    var tmpOutputDir = tmpDir();

    var result = bundler.bundle({
      outputPath: tmpOutputDir
    });

    var serverManifest = JSON.parse(
      fs.readFileSync(
        path.join(tmpOutputDir, "programs", "server",
                  "program.json")
      )
    );
    var testTxtPath;
    var nestedTxtPath;
    var packageTxtPath;
    var unregisteredExtensionPath;
    _.each(serverManifest.load, function (item) {
      if (item.path === "packages/test-package.js") {
        packageTxtPath = path.join(
          tmpOutputDir, "programs", "server", item.assets['test-package.txt']);
        unregisteredExtensionPath = path.join(
          tmpOutputDir, "programs", "server", item.assets["test.notregistered"]);
      }
      if (item.path === "app/test.js") {
        testTxtPath = path.join(
          tmpOutputDir, "programs", "server", item.assets['test.txt']);
        nestedTxtPath = path.join(
          tmpOutputDir, "programs", "server", item.assets["nested/test.txt"]);
      }
    });
    // check that the files are where the manifest says they are
    assert.strictEqual(result.errors, false, result.errors && result.errors[0]);
    assert(fs.existsSync(testTxtPath));
    assert(fs.existsSync(nestedTxtPath));
    assert(fs.existsSync(packageTxtPath));
    assert(fs.existsSync(unregisteredExtensionPath));
    assert.strictEqual(fs.readFileSync(testTxtPath, "utf8"), "Test\n");
    assert.strictEqual(fs.readFileSync(nestedTxtPath, "utf8"), "Nested\n");
    assert.strictEqual(fs.readFileSync(packageTxtPath, "utf8"), "Package\n");
    assert.strictEqual(fs.readFileSync(unregisteredExtensionPath, "utf8"),
                       "No extension handler\n");

    // Run the app to check that Assets.getText/Binary do the right things.
    var cp = require('child_process');
    var meteor = process.env.METEOR_TOOL_PATH;
    var fut = new Future();
    // use a non-default port so we don't fail if someone is running an app now
    var proc = cp.spawn(meteor, ["--once", "--port", "4123"], {
      cwd: path.join(__dirname, "app-with-private"),
      stdio: 'inherit'
    });
    proc.on("exit", function (code) {
      fut.return(code);
    });
    assert.strictEqual(fut.wait(), 0);
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
