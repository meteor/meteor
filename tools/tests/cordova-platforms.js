var selftest = require('../selftest.js');
var Sandbox = selftest.Sandbox;
var files = require('../files.js');
var _ = require('underscore');
var utils = require('../utils.js');
var fs = require('fs');
var path = require('path');

// Add plugins to an app. Change the contents of the plugins and their
// dependencies, make sure that the app still refreshes.
selftest.define("add cordova platforms", function () {
  var s = new Sandbox();
  var run;

  // Starting a run
  s.createApp("myapp", "package-tests");
  s.cd("myapp");
  s.set("METEOR_TEST_TMP", files.mkdtemp());

  run = s.run("run", "android");
  run.matchErr("platform is not added");
  run.matchErr("meteor add-platform android");
  run.expectExit(1);

  run = s.run("add-platform", "android");
  run.match("Do you agree");
  run.write("Y\n");
  run.extraTime = 90; // Huge download
  run.match("added");

  run = s.run("remove-platform", "foo");
  run.match("foo is not");

  run = s.run("remove-platform", "android");
  run.match("removed");
  run = s.run("run", "android");
  run.matchErr("platform is not added");
  run.matchErr("meteor add-platform android");
  run.expectExit(1);
});
