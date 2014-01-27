var _ = require('underscore');
var path = require('path');
var Fiber = require('fibers');
var files = require('../../../files.js');
var meteorNpm = require('../../../meteor-npm.js');
var release = require('../../../release.js');

// Expected contents of main.js
exports.mainJSContents = "process.argv.splice(2, 0, 'program.json');\nprocess.chdir(require('path').join(__dirname, 'programs', 'server'));\nrequire('./programs/server/boot.js');\n";

var tmpBaseDir = files.mkdtemp('test_bundler');
var tmpCounter = 1;
var lastTmpDir;
exports.prettyTmpDir = function () {
  lastTmpDir = path.join(tmpBaseDir, "" + (tmpCounter++) /* path.join likes string, not numbers */);
  files.mkdir_p(lastTmpDir);
  return lastTmpDir;
};

Fiber(function () {
  try {
    release.setCurrent(release.load(null));

    // print calls to `npm`
    meteorNpm._printNpmCalls = true;

    /// RUN TESTS
//    require('./test-bundler-assets.js').runAssetsTest();
//    require('./test-bundler-options.js').runOptionsTest();
    require('./test-bundler-npm.js').runNpmTest();;
  } catch (err) {
    // print stack track and exit with error code if an assertion fails
    console.log(err.stack);
    console.log();
    console.log('Bundle can be found at ' + lastTmpDir);
    process.exit(1);
  };
}).run();
