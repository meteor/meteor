var selftest = require('../tool-testing/selftest.js');
var Sandbox = selftest.Sandbox;

selftest.skip.define("minifiers can't register non-js/non-css extensions", [], function () {
  var s = new Sandbox();
  var run;

  s.createApp("myapp", "minifier-plugin-bad-extension", { dontPrepareApp: true });
  s.cd("myapp");

  run = s.run();
  run.match("foo: Minifiers are only allowed to register \"css\" or \"js\" extensions.");
  run.stop();
});

selftest.skip.define("minifiers: apps can't use more than one package providing a minifier for the same extension", [], function () {
  var s = new Sandbox();
  var run;

  s.createApp("myapp", "minifier-plugin-multiple-minifiers-for-js", { dontPrepareApp: true });
  s.cd("myapp");

  run = s.run("--production");
  run.match("local-plugin, local-plugin-2: multiple packages registered minifiers for extension \"js\".");
  run.stop();
});
