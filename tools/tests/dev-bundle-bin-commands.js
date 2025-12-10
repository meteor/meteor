var selftest = require('../tool-testing/selftest.js');
var Sandbox = selftest.Sandbox;

selftest.define("meteor npm run some-script-name - error returns exit status to shell", async function () {
  var s = new Sandbox();
  await s.init();
  var run;

  await s.createApp("myapp", "dev-bundle-bin-commands");
  s.cd("myapp");
  run = s.run("npm", "run", "exit-with-status");
  await run.matchErr("This script has an exit status");
  await run.expectExit(1);
});

selftest.define("meteor npm some-script-name - normal exit returns normal to shell", async function () {
  var s = new Sandbox();
  await s.init();

  var run;

  await s.createApp("myapp", "dev-bundle-bin-commands");
  s.cd("myapp");
  run = s.run("npm", "run", "exit-normally");
  await run.match("This script will exit normally");
  await run.expectExit(0);
});
