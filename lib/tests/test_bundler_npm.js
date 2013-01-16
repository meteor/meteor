var meteorNpm = require(path.join(__dirname, '..', 'meteor_npm.js'));

///
/// TEST PACKAGE DIR
///
var tmpPackageDirContainer = tmpDir();
var testPackageDir = path.join(tmpPackageDirContainer, 'test-package');

fs.mkdirSync(testPackageDir);
fs.writeFileSync(path.join(testPackageDir, 'package.js'),
                 "Package.describe({summary: 'a package that uses npm modules'});\n"
                 + "\n"
                 + "Package.on_use(function(api, where) { api.useNpm({gcd: '0.0.0'}); });");
process.env.PACKAGE_DIRS = tmpPackageDirContainer;


///
/// TEST APP USING TEST PACKAGE DIR
///
var appWithPackageDir = path.join(__dirname, 'unversioned-app-with-package');

///
/// HELPERS
///

var _assertCorrectPackageNpmDir = function(deps, nodeModulesShouldHaveBeenDeleted) {
  // test-package/.npm was generated

  // sort of a weird way to do it, but i don't want to have to look up all subdependencies
  // to write these tests, so just transplant that information
  var actualMeteorNpmShrinkwrapDependencies = JSON.parse(fs.readFileSync(path.join(testPackageDir, ".npm", "meteor-npm-shrinkwrap.json"), 'utf8')).dependencies;
  var expectedMeteorNpmShrinkwrapDependencies = _.object(_.map(deps, function(version, name) {
    var val = {version: version};
    if (actualMeteorNpmShrinkwrapDependencies[name].dependencies)
      val.dependencies = actualMeteorNpmShrinkwrapDependencies[name].dependencies;
    return [name, val];
  }));

  assert.equal(
    fs.readFileSync(path.join(testPackageDir, ".npm", "meteor-npm-shrinkwrap.json"), 'utf8'),
    JSON.stringify({
      name: "packages",
      version: "0.0.0",
      dependencies: expectedMeteorNpmShrinkwrapDependencies}, null, /*indentation, the way npm uses it*/2) + '\n');


  if (nodeModulesShouldHaveBeenDeleted) {
    assert(!fs.exists(path.join(testPackageDir, '.npm', 'node_modules')));
  } else {
    // verify the contents of the `node_modules` dir
    _.each(deps, function(version, name) {
      // presumably if this file is here we have correctly installed the package
      assert(fs.existsSync(path.join(testPackageDir, '.npm', 'node_modules', name, 'LICENSE')));

      assert.equal(JSON.parse(
        fs.readFileSync(
          path.join(testPackageDir, ".npm", "node_modules", name, "package.json"),
          'utf8')).version,
                   version);
    });
  }
};

var _assertCorrectBundleNpmContents = function(bundleDir, deps) {
  // sanity check -- main.js has expected contents.
  assert.strictEqual(fs.readFileSync(path.join(bundleDir, "main.js"), "utf8").trim(),
                     "require(require('path').join(__dirname, 'server', 'server.js'));");

  var bundledPackageNodeModulesDir = path.join(bundleDir, 'app', 'packages', 'test-package', 'node_modules');

  // bundle actually has the npm modules
  _.each(deps, function(version, name) {
    // presumably if this file is here we have correctly installed the package
    assert(fs.existsSync(path.join(bundledPackageNodeModulesDir, name, 'LICENSE')));

    assert.equal(JSON.parse(
      fs.readFileSync(path.join(bundledPackageNodeModulesDir, name, 'package.json'), 'utf8'))
                 .version,
                 version);
  });
};

///
/// TESTS
///

console.log("app that uses gcd - clean run");
assert.doesNotThrow(function () {
  var tmpOutputDir = tmpDir();
  var errors = bundler.bundle(appWithPackageDir, tmpOutputDir, {nodeModulesMode: 'skip'});
  assert.strictEqual(errors, undefined, errors && errors[0]);
  _assertCorrectPackageNpmDir({gcd: '0.0.0'});
  _assertCorrectBundleNpmContents(tmpOutputDir, {gcd: '0.0.0'});
});

console.log("app that uses gcd - no changes, running again");
assert.doesNotThrow(function () {
  var tmpOutputDir = tmpDir();
  var errors = bundler.bundle(appWithPackageDir, tmpOutputDir, {nodeModulesMode: 'skip'});
  assert.strictEqual(errors, undefined, errors && errors[0]);
  _assertCorrectPackageNpmDir({gcd: '0.0.0'});
  _assertCorrectBundleNpmContents(tmpOutputDir, {gcd: '0.0.0'});
});

console.log("app that uses gcd - simulate failure, or as would be in a 3rd party repository (no .npm/node_modules)");
assert.doesNotThrow(function () {
  var tmpOutputDir = tmpDir();
  meteorNpm._execSync("rm -rf .npm/node_modules", {cwd: testPackageDir});
  var errors = bundler.bundle(appWithPackageDir, tmpOutputDir, {nodeModulesMode: 'skip'});
  assert.strictEqual(errors, undefined, errors && errors[0]);
  _assertCorrectPackageNpmDir({gcd: '0.0.0'});
  _assertCorrectBundleNpmContents(tmpOutputDir, {gcd: '0.0.0'});
});


console.log("app that uses gcd - add mime and semver");
assert.doesNotThrow(function () {
  fs.writeFileSync(path.join(testPackageDir, 'package.js'),
                   "Package.describe({summary: 'a package that uses npm modules'});\n"
                   + "\n"
                   + "Package.on_use(function(api, where) {\n"
                   + "  api.useNpm({gcd: '0.0.0', mime: '1.2.7', semver: '1.1.0'});\n"
                   + "});");

  var tmpOutputDir = tmpDir();
  var errors = bundler.bundle(appWithPackageDir, tmpOutputDir, {nodeModulesMode: 'skip'});
  assert.strictEqual(errors, undefined, errors && errors[0]);
  _assertCorrectPackageNpmDir({gcd: '0.0.0', mime: '1.2.7', semver: '1.1.0'});
  _assertCorrectBundleNpmContents(tmpOutputDir, {gcd: '0.0.0', mime: '1.2.7', semver: '1.1.0'});
});

console.log("app that uses gcd - upgrade mime, remove semver");
assert.doesNotThrow(function () {
  fs.writeFileSync(path.join(testPackageDir, 'package.js'),
                   "Package.describe({summary: 'a package that uses npm modules'});\n"
                   + "\n"
                   + "Package.on_use(function(api, where) {\n"
                   + "  api.useNpm({gcd: '0.0.0', mime: '1.2.8'});\n"
                   + "});");

  var tmpOutputDir = tmpDir();
  var errors = bundler.bundle(appWithPackageDir, tmpOutputDir, {nodeModulesMode: 'skip'});
  assert.strictEqual(errors, undefined, errors && errors[0]);
  _assertCorrectPackageNpmDir({gcd: '0.0.0', mime: '1.2.8'});
  _assertCorrectBundleNpmContents(tmpOutputDir, {gcd: '0.0.0', mime: '1.2.8'});
});

console.log("app that uses gcd - try downgrading mime to non-existant version");
assert.doesNotThrow(function () {
  fs.writeFileSync(path.join(testPackageDir, 'package.js'),
                   "Package.describe({summary: 'a package that uses npm modules'});\n"
                   + "\n"
                   + "Package.on_use(function(api, where) {\n"
                   + "  api.useNpm({gcd: '0.0.0', mime: '0.1.2'});\n"
                   + "});");

  var tmpOutputDir = tmpDir();
  var errors = bundler.bundle(appWithPackageDir, tmpOutputDir, {nodeModulesMode: 'skip'});
  assert.strictEqual(errors.length, 1);
  assert(/version not found/.test(errors[0]));

  // make sure we delete `node_modules` in case some packages got
  // installed and others haven't. the next test will make sure we
  // recover from this state.
  _assertCorrectPackageNpmDir({gcd: '0.0.0', mime: '1.2.8'}/*shouldn't've changed*/,
                              /*nodeModulesShouldHaveBeenDeleted*/true);
});

console.log("app that uses gcd - downgrade mime to an existant version");
assert.doesNotThrow(function () {
  fs.writeFileSync(path.join(testPackageDir, 'package.js'),
                   "Package.describe({summary: 'a package that uses npm modules'});\n"
                   + "\n"
                   + "Package.on_use(function(api, where) {\n"
                   + "  api.useNpm({gcd: '0.0.0', mime: '1.2.7'});\n"
                   + "});");

  var tmpOutputDir = tmpDir();
  var errors = bundler.bundle(appWithPackageDir, tmpOutputDir, {nodeModulesMode: 'skip'});
  assert.strictEqual(errors, undefined, errors && errors[0]);

  _assertCorrectPackageNpmDir({gcd: '0.0.0', mime: '1.2.7'});
  _assertCorrectBundleNpmContents(tmpOutputDir, {gcd: '0.0.0', mime: '1.2.7'});
});


///
/// SUCCESS
///
delete process.env.PACKAGE_DIRS;