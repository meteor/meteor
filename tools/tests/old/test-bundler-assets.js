var _ = require('underscore');
var assert = require('assert');
var Future = require('fibers/future');
var files = require('../../files.js');
var bundler = require('../../bundler.js');
var isopackets = require("../../isopackets.js");
var release = require('../../release.js');
var catalog = require('../../catalog.js');
var buildmessage = require('../../buildmessage.js');
var projectContextModule = require('../../project-context.js');

var lastTmpDir = null;
var tmpDir = function () {
  return (lastTmpDir = files.mkdtemp());
};

var makeProjectContext = function (appName) {
  var projectDir = files.mkdtemp("test-bundler-assets");
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

// These tests make some assumptions about the structure of stars: that there
// are client and server programs inside programs/.

var runTest = function () {
  // As preparation, we need to initialize the official catalog, which serves
  // as our sql data store.
  catalog.official.initialize();

  console.log("Bundle app with public/ directory");
  assert.doesNotThrow(function () {
    var projectContext = makeProjectContext("app-with-public");

    var tmpOutputDir = tmpDir();
    var result = bundler.bundle({
      projectContext: projectContext,
      outputPath: tmpOutputDir
    });
    var clientManifest = JSON.parse(
      files.readFile(
        files.pathJoin(tmpOutputDir, "programs", "web.browser", "program.json")
      )
    );

    var testCases = [["/test.txt", "Test\n"],
                     ["/nested/nested.txt", "Nested\n"]];
    _.each(testCases, function (file) {
      var manifestItem = _.find(clientManifest.manifest, function (m) {
        return m.url === file[0];
      });
      assert(manifestItem);
      var diskPath = files.pathJoin(tmpOutputDir, "programs", "web.browser",
                               manifestItem.path);
      assert(files.exists(diskPath));
      assert.strictEqual(files.readFile(diskPath, "utf8"), file[1]);
    });
  });

  console.log("Bundle app with private/ directory and package asset");
  assert.doesNotThrow(function () {
    var projectContext = makeProjectContext("app-with-private");

    var tmpOutputDir = tmpDir();

    var result = bundler.bundle({
      projectContext: projectContext,
      outputPath: tmpOutputDir
    });

    var serverManifest = JSON.parse(
      files.readFile(
        files.pathJoin(tmpOutputDir, "programs", "server",
                  "program.json")
      )
    );
    var testTxtPath;
    var nestedTxtPath;
    var packageTxtPath;
    var unregisteredExtensionPath;
    _.each(serverManifest.load, function (item) {
      if (item.path === "packages/test-package.js") {
        packageTxtPath = files.pathJoin(
          tmpOutputDir, "programs", "server", item.assets['test-package.txt']);
        unregisteredExtensionPath = files.pathJoin(
          tmpOutputDir, "programs", "server", item.assets["test.notregistered"]);
      }
      if (item.path === "app/test.js") {
        testTxtPath = files.pathJoin(
          tmpOutputDir, "programs", "server", item.assets['test.txt']);
        nestedTxtPath = files.pathJoin(
          tmpOutputDir, "programs", "server", item.assets["nested/test.txt"]);
      }
    });
    // check that the files are where the manifest says they are
    assert.strictEqual(result.errors, false, result.errors && result.errors[0]);
    assert(files.exists(testTxtPath));
    assert(files.exists(nestedTxtPath));
    assert(files.exists(packageTxtPath));
    assert(files.exists(unregisteredExtensionPath));
    assert.strictEqual(files.readFile(testTxtPath, "utf8"), "Test\n");
    assert.strictEqual(files.readFile(nestedTxtPath, "utf8"), "Nested\n");
    assert.strictEqual(files.readFile(packageTxtPath, "utf8"), "Package\n");
    assert.strictEqual(files.readFile(unregisteredExtensionPath, "utf8"),
                       "No extension handler\n");

    // Run the app to check that Assets.getText/Binary do the right things.
    var meteorToolPath = files.convertToOSPath(process.env.METEOR_TOOL_PATH);
    var fut = new Future();
    require('child_process').execFile(
      meteorToolPath,
      // use a non-default port so we don't fail if someone is running an app
      // now
      ["--once", "--port", "4123"], {
        cwd: files.convertToOSPath(projectContext.projectDir),
        stdio: 'inherit'
      },
      fut.resolver()
    );
    fut.wait();  // would throw if command failed
  });
};

var Fiber = require('fibers');
Fiber(function () {
  if (! files.inCheckout()) {
    throw Error("This old test doesn't support non-checkout");
  }

  try {
    release.setCurrent(release.load(null));
    isopackets.ensureIsopacketsLoadable();
    runTest();
  } catch (err) {
    console.log(err.stack);
    console.log('\nBundle can be found at ' + lastTmpDir);
    process.exit(1);
  }
}).run();
