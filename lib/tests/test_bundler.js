var path = require('path');
var assert = require('assert');
var fs = require('fs');
var files = require(path.join(__dirname, '..', 'files.js'));
var bundler = require(path.join(__dirname, '..', 'bundler.js'));
var inFiber = require(path.join(__dirname, '..', 'fiber-helpers.js')).inFiber;

///
/// SETUP
///

// print stack track and exit with error code if an assertion fails
process.on('uncaughtException', function (err) {
  console.log(err.stack);
  process.exit(1);
});

///
/// UTILITIES
///

var tmpDir = function () {
  return files.mkdtemp('test_bundler');
};

///
/// TEST APPS
///

// an empty app with a .meteor/version file whose contents are "0.1"
var versionedAppDir = path.join(__dirname, 'empty-versioned-app');
// an empty app with no .meteor/version file
var unversionedAppDir = path.join(__dirname, 'empty-unversioned-app');

///
/// TESTS
///

// versioned app, no options
assert.doesNotThrow(inFiber(function () {
  var tmpOutputDir = tmpDir();
  var errors = bundler.bundle(versionedAppDir, tmpOutputDir);
  assert.strictEqual(errors, undefined);

  // XXX leaving this here for now since it'll be helpful for
  // writing more tests
  console.log('bundle successfully created at ' + tmpOutputDir);

  // sanity check -- main.js has expected contents.
  assert.strictEqual(fs.readFileSync(path.join(tmpOutputDir, "main.js"), "utf8").trim(),
                     "require(require('path').join(__dirname, 'server', 'server.js'));");
}));

// unversioned app, no options
assert.doesNotThrow(inFiber(function () {
  var tmpOutputDir = tmpDir();
  var errors = bundler.bundle(unversionedAppDir, tmpOutputDir);
  assert.notEqual(errors.length, 0);
  assert.notEqual(errors[0].indexOf('Exception while bundling'), -1);
  assert.notEqual(errors[0].indexOf('Package not found: meteor'), -1);
}));

// unversioned app, using `versionOverride`
assert.doesNotThrow(inFiber(function () {
  var tmpOutputDir = tmpDir();
  var errors = bundler.bundle(unversionedAppDir, tmpOutputDir, {versionOverride: '0.1'});
  assert.strictEqual(errors, undefined);

  // XXX leaving this here for now since it'll be helpful for
  // writing more tests
  console.log('bundle successfully created at ' + tmpOutputDir);

  // sanity check -- main.js has expected contents.
  assert.strictEqual(fs.readFileSync(path.join(tmpOutputDir, "main.js"), "utf8").trim(),
                     "require(require('path').join(__dirname, 'server', 'server.js'));");
}));

