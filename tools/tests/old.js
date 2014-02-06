var selftest = require('../selftest.js');
var Sandbox = selftest.Sandbox;
var Run = selftest.Run;
var path = require('path');
var files = require('../files.js');
var release = require('../release.js');

// old tests don't get to test --release, and always run this release
var maybeFixRelease = function (env) {
  if (release.current && release.current.isProperRelease())
    env.METEOR_SPRINGBOARD_RELEASE = release.current.name;
  return env;
};

// This runs an old-style unit test. These are just .js files that
// require() whatever bits of the tool they want to test and have at
// them. They exit with 0 on success or something else on failure, and
// they are very chatty about logging their progress to stdout/stderr.
//
// filename is interpreted relative to tools/selftests/old.
var runOldTest = function (filename) {
  var s = new Sandbox;
  var run = new Run(process.execPath, {
    args: [path.resolve(__dirname, 'old', filename)],
    env: maybeFixRelease({
      METEOR_TOOL_PATH: s.execPath
    })
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

selftest.define("bundler-npm", ["slow", "net"], function () {
  runOldTest('test-bundler-npm.js');
});

// This last one's is a shell script!
// XXX pardon the hacky glue to make it work with a sandbox

// If we're running from a checkout, run it both in checkout mode and
// in release mode. If we're not running from a checkout, just run it
// against the installed copy.

selftest.define("old cli tests", ["slow", "net"], function () {
  var s = new Sandbox;
  var run = new Run(path.join(__dirname, 'old', 'cli-test.sh'), {
    env: maybeFixRelease({
      METEOR_TOOL_PATH: s.execPath,
      NODE: process.execPath
    })
  });
  run.waitSecs(1000);
  run.match("PASSED\n");
  run.expectExit(0);
});

selftest.define("old cli tests (warehouse)", ["slow", "checkout", "net"], function () {
  var s = new Sandbox({
    warehouse: {
      v1: { tools: 'tools1', latest: true }
    }
  });

  var run = new Run(path.join(__dirname, 'old', 'cli-test.sh'), {
    env: {
      METEOR_TOOL_PATH: s.execPath,
      METEOR_WAREHOUSE_DIR: s.warehouse,
      NODE: process.execPath
    }
  });
  run.waitSecs(1000);
  run.match("PASSED\n");
  run.expectExit(0);
});

