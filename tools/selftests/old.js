var selftest = require('../selftest.js');
var Run = selftest.Run;
var path = require('path');

// This runs an old-style unit test. These are just .js files that
// require() whatever bits of the tool they want to test and have at
// them. They exit with 0 on success or something else on failure, and
// they are very chatty about logging their progress to stdout/stderr.
//
// filename is interpreted relative to tools/selftests/old.
var runOldTest = function (filename) {
  var run = new Run(process.execPath, {
    args: [path.resolve(__dirname, 'old', filename)]
  });
  run.waitSecs(1000);
  run.expectExit(0);
};

selftest.define("watch", ["slow"], function () {
  runOldTest('test-watch.js');
});

selftest.define("bundler-assets", function () {
  runOldTest('test-bundler-assets.js');
});

selftest.define("bundler-options", function () {
  runOldTest('test-bundler-options.js');
});

selftest.define("bundler-npm", ["slow"], function () {
  runOldTest('test-bundler-npm.js');
});

