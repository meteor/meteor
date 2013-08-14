var appWithPublic = path.join(__dirname, 'app-with-public');
var appWithPrivate = path.join(__dirname, 'app-with-private');

// These tests make some assumptions about the structure of stars: that there
// are client and server programs inside programs/.

console.log("Bundle app with public/ directory");
assert.doesNotThrow(function () {
  var lib = new library.Library({
    localPackageDirs: [ path.join(files.getCurrentToolsDir(), 'packages') ]
  });
  var tmpOutputDir = tmpDir();
  var result = bundler.bundle(appWithPublic, tmpOutputDir, {
    nodeModulesMode: 'skip',
    library: lib,
    releaseStamp: 'none'
  });
  var clientManifest = JSON.parse(
    fs.readFileSync(
      path.join(tmpOutputDir, "programs", "client", "program.json")
    )
  );

  var testCases = [["/test.txt", "Test\n"],
               ["/nested/nested.txt", "Nested\n"]];
  _.each(testCases, function (file) {
    var manifestItem = _.find(clientManifest.manifest, function (m) {
      return m.url === file[0];
    });
    assert(manifestItem);
    var diskPath = path.join(tmpOutputDir, "programs", "client",
                             manifestItem.path);
    assert(fs.existsSync(diskPath));
    assert.strictEqual(fs.readFileSync(diskPath, "utf8"), file[1]);
  });
});

console.log("Bundle app with private/ directory and package asset");
assert.doesNotThrow(function () {
  // Make sure we rebuild this app package.
  files.rm_recursive(
    path.join(appWithPrivate, "packages", "test-package", ".build"));

  var lib = new library.Library({
    localPackageDirs: [ path.join(files.getCurrentToolsDir(), 'packages'),
                        path.join(appWithPrivate, "packages") ]
  });
  var tmpOutputDir = tmpDir();
  var result = bundler.bundle(appWithPrivate, tmpOutputDir, {
    nodeModulesMode: 'skip',
    library: lib,
    releaseStamp: 'none'
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
  var meteor = path.join(__dirname, "..", "..", "meteor"); // XXX is this allowed?
  var fut = new Future();
  var proc = cp.spawn(meteor, ["--once"], {
    cwd: path.join(__dirname, "app-with-private"),
    stdio: 'inherit'
  });
  proc.on("exit", function (code) {
    fut.return(code);
  });
  assert.strictEqual(fut.wait(), 0);
});

console.log("Use Assets API from unipackage");
assert.doesNotThrow(function () {
  var lib = new library.Library({
    localPackageDirs: [ path.join(files.getCurrentToolsDir(), "packages"),
                       path.join(appWithPrivate, "packages") ]
  });
  var testPackage = unipackage.load({
    library: lib,
    packages: ['test-package']
  })['test-package'].TestAsset;
  testPackage.go(false /* don't exit when done */);
});
