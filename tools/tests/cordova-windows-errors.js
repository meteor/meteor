var files = require('../files.js');
var selftest = require('../selftest.js');
var Sandbox = selftest.Sandbox;


selftest.define("windows prints correct message when it can't do mobile things", ["windows"], function () {
  var s = new Sandbox();
  
  var run;

  s.createApp("myapp", "standard-app");
  s.cd("myapp");

  run = s.run("run", "android");

  // We print some warning that involves saying you're on Windows
  run.matchErr("Windows");
});
