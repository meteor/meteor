var selftest = require('../selftest.js');
var Sandbox = selftest.Sandbox;
var files = require('../files.js');

selftest.define("add cordova platforms", function () {
  var s = new Sandbox();
  var run;

  // Starting a run
  s.createApp("myapp", "package-tests");
  s.cd("myapp");
  s.set("METEOR_TEST_TMP", files.mkdtemp());

  run = s.run("run", "android");
  run.matchErr("Please add the Android platform to your project first");
  run.match("meteor add-platform android");
  run.expectExit(2);

  // XXX: This prints the Android EULA.
  // We should move this to a once-per-machine agreement.
  /*
  run = s.run("add-platform", "android");
  run.matchErr("Platform is not installed");
  run.expectExit(2);
  */

  run = s.run("install-sdk", "android");
  run.extraTime = 90; // Big downloads
  run.expectExit(0);

  run = s.run("add-platform", "android");
  run.match("Do you agree");
  run.write("Y\n");
  run.extraTime = 90; // Huge download
  run.match("added");

  run = s.run("remove-platform", "foo");
  run.match("foo: platform is not");

  run = s.run("remove-platform", "android");
  run.match("removed");
  run = s.run("run", "android");
  run.matchErr("Please add the Android platform to your project first");
  run.match("meteor add-platform android");
  run.expectExit(2);
});
