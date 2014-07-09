var _ = require('underscore');

var utils = require('../utils.js');
var testUtils = require('../test-utils.js');
var selftest = require('../selftest.js');
var stats = require('../stats.js');
var Sandbox = selftest.Sandbox;

var testPackagesServer = "https://test-packages.meteor.com";
process.env.METEOR_PACKAGE_SERVER_URL = testPackagesServer;

selftest.define("publish-and-search", ["slow"], function () {
  var s = new Sandbox;

  var username = "test";
  var password = "testtest";

  testUtils.login(s, username, password);
  var packageName = utils.randomToken();
  var fullPackageName = username + ":" + packageName;

  var run = s.run("create", "--package", fullPackageName);
  run.waitSecs(15);
  run.expectExit(0);
  run.match(fullPackageName);

  s.cd(fullPackageName);
  run = s.run("publish");
  run.waitSecs(15);
  run.expectExit(1);
  run.matchErr("Publish failed"); // need to pass --create

  run = s.run("publish", "--create");
  run.waitSecs(15);
  run.expectExit(0);
  run.match("Done");

  run = s.run("search", packageName);
  run.waitSecs(15);
  run.expectExit(0);
  run.match(fullPackageName);
});

selftest.define("publish-one-arch", ["slow"], function () {
  var s = new Sandbox;

  var username = "test";
  var password = "testtest";

  testUtils.login(s, username, password);
  var packageName = utils.randomToken();
  var fullPackageName = username + ":" + packageName;

  var run = s.run("create", "--package", fullPackageName);
  run.waitSecs(15);
  run.expectExit(0);
  run.match(fullPackageName);

  s.cd(fullPackageName);

  run = s.run("publish", "--create");
  run.waitSecs(15);
  run.expectExit(0);
  run.match("Done");
  run.forbidAll("WARNING");
});
