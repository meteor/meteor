var selftest = require('../tool-testing/selftest.js');
var Sandbox = selftest.Sandbox;
var files = require('../fs/files');

function matchPath (text, doubleBS) {
  if (process.platform === 'win32') {
    return text.replace(/\//g, doubleBS ? '\\\\' : '\\');
  }
  return text;
 }
 function matchPathRegexp (regexp) {
  return new RegExp(matchPath(regexp, true));
 }

selftest.define("source maps from checkout", ['checkout'], function () {
  try {
    throw new Error();
  } catch (e) {
    // this refers to the line number where the error is thrown
    const errorLine = "17";
    var index = (process.platform === 'win32') ? 2 : 1;
    const sourceMap = e.stack.split(":")[index];
    const result = (sourceMap === errorLine);
    selftest.expectEqual(result, true);
  }
});

selftest.define("source maps from an app", ['checkout', 'custom-warehouse'], function () {
  var s = new Sandbox({
    warehouse: {
      v1: { recommended: true }
    }
  });

  // If run not in an app dir, runs the latest version ...
  var run = s.run("--version");
  run.read('Meteor v1\n');
  run.expectEnd();
  run.expectExit(0);

  // Starting a run
  s.createApp("myapp", "app-throws-error", {
    release: "v1"
  });

  s.cd("myapp");
  s.set("METEOR_TEST_TMP", files.convertToOSPath(files.mkdtemp()));  // XXX why?
  run = s.run("run");
  run.waitSecs(10);
  run.match(matchPathRegexp('at throw\\.js:3\\b'));
  run.stop();

  s.set('THROW_FROM_PACKAGE', 't');
  run = s.run('run');
  run.waitSecs(10);
  run.match(matchPathRegexp('packages/throwing-package/thrower\\.js:2\\b'));
  run.stop();
});

selftest.define("source maps from built meteor tool", ['checkout', 'custom-warehouse'], function () {
  var s = new Sandbox({
    warehouse: {
      v1: { recommended: true }
    }
  });

  // Find the line number that is supposed to throw an error
  var commandsJs = files.readFile(files.pathJoin(
    files.convertToStandardPath(__dirname), '../cli/commands.js'), "utf8");

  var lineNumber = 0;
  commandsJs.split("\n").some((line, index) => {
    if (line.indexOf("#StackTraceTest") != -1) {
      // Lines aren't zero-indexed
      lineNumber = index + 1;

      // Short-circuit the some
      return true;
    }
  });

  if (lineNumber === 0) {
    throw new Error("Couldn't find the right line. This test is broken.");
  }

  var run = s.run("throw-error");
  run.matchErr(matchPathRegexp('\\(/tools/cli/commands\\.js:' + lineNumber));
  run.expectExit(1);
});

selftest.define("source maps from a build plugin implementation", ['checkout', 'custom-warehouse'], function () {
  var s = new Sandbox({
    warehouse: {
      v1: { recommended: true }
    }
  });

  // Starting a run
  s.createApp("myapp", "build-plugin-throws-error", {
    release: "v1"
  });

  s.cd("myapp");
  var run = s.run("run");
  run.waitSecs(10);
  // XXX This is wrong! The path on disk is
  // packages/build-plugin/build-plugin.js, but at some point we switched to the
  // servePath which is based on the *plugin*'s "package" name.
  run.match(matchPathRegexp('packages/build-plugin-itself/build-plugin\\.js:2:'));
  run.stop();
});
