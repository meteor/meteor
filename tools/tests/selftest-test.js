var selftest = require('../selftest.js');
var Sandbox = selftest.Sandbox;
var files = require('../files.js');

selftest.define("selftest-from-warehouse", ['checkout'], function () {
  var s = new Sandbox({
    warehouse: {
      v1: { recommended: true},
      v2: { recommended: true }
    }
  });
  var run;

  var toolsPackage;
  selftest.doOrThrow(function() {
    toolsPackage = selftest.getToolsPackage();
  });
  var toolsVersion = toolsPackage.name + '@' +
        toolsPackage.version;

  // Create an app with the latest release.
  run = s.run("self-test", "do-nothing");
  run.waitSecs(15);
  run.expectExit(0);
});

selftest.define("do-nothing", function () {
  selftest.expectEqual(true, true);
});
