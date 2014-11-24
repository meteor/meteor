var selftest = require('../selftest.js');
var Sandbox = selftest.Sandbox;
var files = require('../files.js');

selftest.define("selftest-from-warehouse", ['checkout'], function () {
  var s = new Sandbox({
    warehouse: {
      v1: { recommended: true }
    }
  });

  // Create an app with the latest release.
  var run = s.run("self-test", "do-nothing");
  run.waitSecs(15);
  run.expectExit(0);
});

selftest.define("do-nothing", function () {
  selftest.expectEqual(true, true);
});
