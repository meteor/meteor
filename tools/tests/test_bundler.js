///
/// global helpers that are useful for test_bundler_*.js
///
/*global*/ path = require('path');
/*global*/ fs = require('fs');
/*global*/ files = require(path.join(__dirname, '..', 'files.js'));
/*global*/ bundler = require(path.join(__dirname, '..', 'bundler.js'));
/*global*/ library = require(path.join(__dirname, '..', 'library.js'));
/*global*/ unipackage = require(path.join(__dirname, '..', 'unipackage.js'));
/*global*/ release = require(path.join(__dirname, '..', 'release.js'));
/*global*/ _ = require('underscore');
/*global*/ assert = require('assert');
/*global*/ Fiber = require('fibers');
/*global*/ Future = require('fibers/future');

/*global*/ mainJSContents = "process.argv.splice(2, 0, 'program.json');\nprocess.chdir(require('path').join(__dirname, 'programs', 'server'));\nrequire('./programs/server/boot.js');\n";

var tmpBaseDir = files.mkdtemp('test_bundler');
var tmpCounter = 1;
var lastTmpDir;
/*global*/ tmpDir = function () {
  lastTmpDir = path.join(tmpBaseDir, "" + (tmpCounter++) /* path.join likes string, not numbers */);
  files.mkdir_p(lastTmpDir);
  return lastTmpDir;
};

Fiber(function () {
  try {
    // print calls to `npm`
    require(path.join(__dirname, '..', 'meteor-npm.js'))._printNpmCalls = true;

    /// RUN TESTS
    require(path.join(__dirname, 'test_bundler_assets.js'));
    require(path.join(__dirname, 'test_bundler_options.js'));
    require(path.join(__dirname, 'test_bundler_npm.js'));
  } catch (err) {
    // print stack track and exit with error code if an assertion fails
    console.log(err.stack);
    console.log();
    console.log('Bundle can be found at ' + lastTmpDir);
    process.exit(1);
  };
}).run();
