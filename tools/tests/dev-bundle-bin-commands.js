var selftest = require('../tool-testing/selftest.js');
var Sandbox = selftest.Sandbox;

selftest.define("meteor npm run some-script-name - error returns exit status to shell", function () {
  var s = new Sandbox();
  var run;

  s.createApp("myapp", "dev-bundle-bin-commands");
  s.cd("myapp");
  run = s.run("npm", "run", "exit-with-status");
  run.matchErr("This script has an exit status");
  run.expectExit(1);
});

selftest.define("meteor npm some-script-name - normal exit returns normal to shell", function () {
  var s = new Sandbox();
  var run;

  s.createApp("myapp", "dev-bundle-bin-commands");
  s.cd("myapp");
  run = s.run("npm", "run", "exit-normally");
  run.match("This script will exit normally");
  run.expectExit(0);
});