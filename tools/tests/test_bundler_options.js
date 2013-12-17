///
/// TEST APPS
///

// an empty app. notably this app has no .meteor/release file.
var emptyAppDir = path.join(__dirname, 'empty-app');


///
/// TESTS
///

lib = new library.Library({
  localPackageDirs: [ path.join(files.getCurrentToolsDir(), 'packages') ]
});

console.log("nodeModules: 'skip'");
assert.doesNotThrow(function () {
  var tmpOutputDir = tmpDir();
  var result = bundler.bundle(emptyAppDir, tmpOutputDir, {nodeModulesMode: 'skip', releaseStamp: 'none', minify: true, library: lib});
  assert.strictEqual(result.errors, false, result.errors && result.errors[0]);

  // sanity check -- main.js has expected contents.
  assert.strictEqual(fs.readFileSync(path.join(tmpOutputDir, "main.js"), "utf8"),
                     mainJSContents);
  // no top level node_modules directory
  assert(!fs.existsSync(path.join(tmpOutputDir,
                                  "programs", "server", "node_modules")));
  // yes package node_modules directory
  assert(fs.lstatSync(path.join(
    tmpOutputDir, "programs", "server", "npm", "livedata"))
         .isDirectory());

  // verify that contents are minified
  var appHtml = fs.readFileSync(path.join(tmpOutputDir, "programs",
                                          "client", "app.html"), 'utf8');
  assert(/src=\"##BUNDLED_JS_CSS_PREFIX##\/[0-9a-f]{40,40}.js\"/.test(appHtml));
  assert(!(/src=\"##BUNDLED_JS_CSS_PREFIX##\/packages/.test(appHtml)));
});

console.log("nodeModules: 'skip', no minify");
assert.doesNotThrow(function () {
  var tmpOutputDir = tmpDir();
  var result = bundler.bundle(emptyAppDir, tmpOutputDir, {nodeModulesMode: 'skip', minify: false, releaseStamp: 'none', library: lib});
  assert.strictEqual(result.errors, false);

  // sanity check -- main.js has expected contents.
  assert.strictEqual(fs.readFileSync(path.join(tmpOutputDir, "main.js"), "utf8"),
                     mainJSContents);
  // verify that contents are not minified
  var appHtml = fs.readFileSync(path.join(tmpOutputDir, "programs",
                                          "client", "app.html"), 'utf8');
  assert(!(/src=\"##BUNDLED_JS_CSS_PREFIX##\/[0-9a-f]{40,40}.js\"/.test(appHtml)));
  assert(/src=\"##BUNDLED_JS_CSS_PREFIX##\/packages\/meteor/.test(appHtml));
  assert(/src=\"##BUNDLED_JS_CSS_PREFIX##\/packages\/deps/.test(appHtml));
  // verify that tests aren't included
  assert(!(/src=\"##BUNDLED_JS_CSS_PREFIX##\/package-tests\/meteor/.test(appHtml)));
});

console.log("nodeModules: 'skip', no minify, testPackages: ['meteor']");
assert.doesNotThrow(function () {
  var tmpOutputDir = tmpDir();
  var result = bundler.bundle(
    emptyAppDir, tmpOutputDir, {nodeModulesMode: 'skip', minify: false, testPackages: ['meteor'], releaseStamp: 'none', library: lib});
  assert.strictEqual(result.errors, false);

  // sanity check -- main.js has expected contents.
  assert.strictEqual(fs.readFileSync(path.join(tmpOutputDir, "main.js"), "utf8"),
                     mainJSContents);
  // verify that tests for the meteor package are included
  var appHtml = fs.readFileSync(path.join(tmpOutputDir, "programs",
                                          "client", "app.html"));
  assert(/src=\"##BUNDLED_JS_CSS_PREFIX##\/packages\/meteor:tests\.js/.test(appHtml));
});

console.log("nodeModules: 'copy'");
assert.doesNotThrow(function () {
  var tmpOutputDir = tmpDir();
  var result = bundler.bundle(emptyAppDir, tmpOutputDir, {nodeModulesMode: 'copy', releaseStamp: 'none', library: lib});
  assert.strictEqual(result.errors, false);

  // sanity check -- main.js has expected contents.
  assert.strictEqual(fs.readFileSync(path.join(tmpOutputDir, "main.js"), "utf8"),
                     mainJSContents);
  // node_modules directory exists and is not a symlink
  assert(!fs.lstatSync(path.join(tmpOutputDir, "programs", "server", "node_modules")).isSymbolicLink());
  // node_modules contains fibers
  assert(fs.existsSync(path.join(tmpOutputDir, "programs", "server", "node_modules", "fibers")));
});

console.log("nodeModules: 'symlink'");
assert.doesNotThrow(function () {
  var tmpOutputDir = tmpDir();
  var result = bundler.bundle(emptyAppDir, tmpOutputDir, {nodeModulesMode: 'symlink', releaseStamp: 'none', library: lib});
  assert.strictEqual(result.errors, false);

  // sanity check -- main.js has expected contents.
  assert.strictEqual(fs.readFileSync(path.join(tmpOutputDir, "main.js"), "utf8"),
                     mainJSContents);
  // node_modules directory exists and is a symlink
  assert(fs.lstatSync(path.join(tmpOutputDir, "programs", "server", "node_modules")).isSymbolicLink());
  // node_modules contains fibers
  assert(fs.existsSync(path.join(tmpOutputDir, "programs", "server", "node_modules", "fibers")));

  // package node_modules directory also a symlink
  assert(fs.lstatSync(path.join(
    tmpOutputDir, "programs", "server", "npm", "livedata", "main", "node_modules"))
         .isSymbolicLink());
});
