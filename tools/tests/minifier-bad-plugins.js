var selftest = require('../tool-testing/selftest.js');
var Sandbox = selftest.Sandbox;

selftest.skip.define("minifiers can't register non-js/non-css extensions", [], async function () {
  var s = new Sandbox();
  await s.init();

  var run;

  await s.createApp("myapp", "minifier-plugin-bad-extension", { dontPrepareApp: true });
  s.cd("myapp");

  run = s.run();
  await run.match("foo: Minifiers are only allowed to register \"css\" or \"js\" extensions.");
  await run.stop();
});

selftest.skip.define("minifiers: apps can't use more than one package providing a minifier for the same extension", [], async function () {
  var s = new Sandbox();
  await s.init();
  var run;

  await s.createApp("myapp", "minifier-plugin-multiple-minifiers-for-js", { dontPrepareApp: true });
  s.cd("myapp");

  run = s.run("--production");
  await run.match("local-plugin, local-plugin-2: multiple packages registered minifiers for extension \"js\".");
  await run.stop();
});
