var selftest = require('../tool-testing/selftest.js');
var Sandbox = selftest.Sandbox;
var utils = require('../utils/utils.js');

selftest.define("modules - unimported lazy files", function() {
  const s = new Sandbox();
  s.createApp("myapp", "app-with-unimported-lazy-file");
  s.cd("myapp", function() {
    const run = s.run("--once");
    run.waitSecs(30);
    run.expectExit(1);
    run.forbid("This file shouldn't be loaded");
  });
});
