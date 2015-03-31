var _ = require('underscore');
var Future = require('fibers/future');
var selftest = require('../selftest.js');
var Sandbox = selftest.Sandbox;
var Run = selftest.Run;
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
var runOldTest = function (filename, extraEnv) {
  var s = new Sandbox;

  // 'Run' assumes that the first argument is a standard path,
  var run = new Run(files.convertToStandardPath(process.execPath), {
    // 'args' are treated as-is, so need to be converted before passing into
    // 'Run'
    args: [files.convertToOSPath(files.pathResolve(
      files.convertToStandardPath(__dirname), 'old', filename))],
    env: maybeFixRelease(_.extend({
      METEOR_TOOL_PATH: s.execPath
    }, extraEnv))
  });
  run.waitSecs(120);
  run.expectExit(0);
};

// XXX Why are these tests from checkout?
//
// Most of the self-test framework works by calling a meteor command and waiting
// for something to happen. Instead, the old tests call isolated functions (ex:
// bundler.bundle) and skip the (now, somewhat complicated) initialization
// process that would usually happen before these functions are called. We have
// managed to hack together some stuff to tide this over when running from
// checkout, but dealing with release overrides in not-checkout has mostly been
// a failure.
//
// It would be nice if these tests were to work from release, and maybe ekate
// will take another look at them later, but it is not worth that much more time
// before 0.9.0.
//
selftest.define("watch", ["slow"], function () {
  var runFuture = runOldTest.future();
  var futures = [
    // Run with pathwatcher (if possible)
    runFuture('test-watch.js'),
    // Run with fs.watchFile fallback
    runFuture('test-watch.js', {
      METEOR_WATCH_FORCE_POLLING: 1
    })
  ];
  Future.wait(futures);
  // Throw if any threw.
  _.each(futures, function (f) {
    f.get();
  });
});

selftest.define("bundler-assets", ["checkout"], function () {
  runOldTest('test-bundler-assets.js');
});

selftest.define("bundler-options", ["checkout"], function () {
  runOldTest('test-bundler-options.js');
});

selftest.define("bundler-npm", ["slow", "net", "checkout"], function () {
  runOldTest('test-bundler-npm.js');
});

// This last one's is a shell script!
// XXX pardon the hacky glue to make it work with a sandbox

// If we're running from a checkout, run it both in checkout mode and
// in release mode. If we're not running from a checkout, just run it
// against the installed copy.

selftest.define("old cli tests (bash)", ["slow", "net", "yet-unsolved-windows-failure"], function () {
  var s = new Sandbox;
  var scriptToRun = files.pathJoin(files.convertToStandardPath(__dirname),
    'old', 'cli-test.sh');
  var run = new Run(scriptToRun, {
    env: maybeFixRelease({
      METEOR_TOOL_PATH: s.execPath,
      NODE: process.execPath
    })
  });
  run.waitSecs(1000);
  run.match("PASSED\n");
  run.expectExit(0);
});
