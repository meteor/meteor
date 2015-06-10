var selftest = require('../selftest.js');
var Sandbox = selftest.Sandbox;
var files = require('../files.js');
var catalog = require('../catalog.js');

selftest.define("source maps from checkout", ['checkout'], function () {
  try {
    throw new Error();
  } catch (e) {
    selftest.expectEqual(e.stack.split(":")[1], "8");
  }
});

selftest.define("source maps from an app", ['checkout', 'net'], function () {
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
  s.set("METEOR_TEST_TMP", files.convertToOSPath(files.mkdtemp()));
  run = s.run("run");
  run.waitSecs(10);
  run.match(/at app\/throw.js:3/);
  run.stop();
});

selftest.define("source maps from built meteor tool", ['checkout', 'net'], function () {
  var s = new Sandbox({
    warehouse: {
      v1: { recommended: true }
    }
  });

  // Find the line number that is supposed to throw an error
  var commandsJs = files.readFile(files.pathJoin(
    files.convertToStandardPath(__dirname), "../commands.js"), "utf8");

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
  run.matchErr('(/tools/commands.js:' + lineNumber);
  run.expectExit(8);
});
