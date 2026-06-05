var selftest = require('../tool-testing/selftest.js');
var Sandbox = selftest.Sandbox;
var Run = selftest.Run;
var files = require('../fs/files');
var release = require('../packaging/release.js');

// old tests don't get to test --release, and always run this release
var maybeFixRelease = function (env) {
  if (release.current && release.current.isProperRelease()) {
    env.METEOR_SPRINGBOARD_RELEASE = release.current.name;
  }
  return env;
};

// This runs an old-style unit test. These are just .js files that
// require() whatever bits of the tool they want to test and have at
// them. They exit with 0 on success or something else on failure, and
// they are very chatty about logging their progress to stdout/stderr.
//
// filename is interpreted relative to tools/selftests/old.
var runOldTest = async function (filename, extraEnv) {
  var s = new Sandbox;
  await s.init();

  // 'Run' assumes that the first argument is a standard path,
  var run = new Run(files.convertToStandardPath(process.execPath), {
    // 'args' are treated as-is, so need to be converted before passing into
    // 'Run'
    args: ['--no-wasm-code-gc', files.convertToOSPath(files.pathResolve(
      files.convertToStandardPath(__dirname), 'old', filename))],
    env: maybeFixRelease(Object.assign({
      METEOR_TOOL_PATH: s.execPath
    }, extraEnv))
  });
  run.waitSecs(120);
  await run.expectExit(0);
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
selftest.define("bundler-assets", ["checkout"], function () {
  return runOldTest('test-bundler-assets.js');
});

selftest.define("bundler-options", ["checkout"], function () {
  return runOldTest('test-bundler-options.js');
});

selftest.define("bundler-devonly", ["checkout"], function () {
  return runOldTest('test-bundler-devonly.js');
});

selftest.define("bundler-devdepends", ["checkout"], function () {
  return runOldTest('test-bundler-devdepends.js');
});

