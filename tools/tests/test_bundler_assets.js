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
  var staticDir = path.join(tmpOutputDir, "programs",
                            "client", clientManifest.static);
  var testTxtPath = path.join(staticDir, "test.txt");
  var nestedTxtPath = path.join(staticDir, "nested", "nested.txt");
  assert.strictEqual(result.errors, false, result.errors && result.errors[0]);
  assert(fs.existsSync(testTxtPath));
  assert(fs.existsSync(nestedTxtPath));
  assert.strictEqual(fs.readFileSync(testTxtPath, "utf8").trim(),
                     "Test");
  assert.strictEqual(fs.readFileSync(nestedTxtPath, "utf8").trim(),
                     "Nested");
});

console.log("Bundle app with private/ directory and package asset");
assert.doesNotThrow(function () {
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
  var staticDir;
  var packageTxtPath;
  _.each(serverManifest.load, function (item) {
    if (item.path === "/packages/test-package.js") {
      packageTxtPath = path.join(tmpOutputDir,
                                 "programs", "server",
                                 item.staticDirectory, "test-package.txt");
    }
    if (item.path === "/app/test.js") {
      staticDir = path.join(tmpOutputDir,
                            "programs", "server",
                            item.staticDirectory);
    }
  });
  // Check that the files are where the manifest says they are
  var testTxtPath = path.join(staticDir, "test.txt");
  var nestedTxtPath = path.join(staticDir, "nested", "test.txt");
  assert.strictEqual(result.errors, false, result.errors && result.errors[0]);
  assert(fs.existsSync(testTxtPath));
  assert(fs.existsSync(nestedTxtPath));
  assert(fs.existsSync(packageTxtPath));
  assert.strictEqual(fs.readFileSync(testTxtPath, "utf8").trim(), "Test");
  assert.strictEqual(fs.readFileSync(nestedTxtPath, "utf8").trim(), "Nested");
  assert.strictEqual(fs.readFileSync(packageTxtPath, "utf8").trim(), "Package");

  // Run the app to check that Assets.getText/Binary do the right things.
  var cp = require('child_process');
  var meteor = path.join(__dirname, "..", "..", "meteor"); // XXX is this allowed?
  var fut = new Future();
  var proc = cp.spawn(meteor, ["--once"], {
    cwd: path.join(__dirname, "app-with-private")
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
