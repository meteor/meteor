var selftest = require('../selftest.js');
var Sandbox = selftest.Sandbox;
var files = require('../files.js');
var _ = require('underscore');
var utils = require('../utils.js');
var fs = require('fs');
var path = require('path');

// Given a sandbox, that has the app as its currend cwd, read the versions file
// and check that it contains the plugins that we are looking for. We don't
// check the order, we just want to make sure that the right dependencies are
// in.
//
// sand: a sandbox, that has the main app directory as its cwd.
// platforms: an array of platforms
var checkCordovaPlatforms = function(sand, platforms) {
  // XXX parse this
  var lines = selftest.execFileSync('cordova', ['platform', 'list'],
    { cwd: path.join(sand.cwd, '.meteor', 'local', 'cordova-build') }).split("\n");

  lines.sort();
  plugins = _.clone(plugins).sort();

  var i = 0;
  _.each(lines, function(line) {
    if (!line || line === '') return;
    // XXX do it
    i++;
  });
  selftest.expectEqual(plugins.length, i);
};

// Given a sandbox, that has the app as its cwd, read the cordova platforms
// file and check that it contains exactly the platforms specified, in order.
//
// sand: a sandbox, that has the main app directory as its cwd.
// platforms: an array of platforms in order.
var checkUserPlatforms = function(sand, platforms) {
  var lines = sand.read(".meteor/cordova-platforms").split("\n");
  // XXX do it
  selftest.expectEqual(platforms.length, i);
};

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
