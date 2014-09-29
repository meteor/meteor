var fs = require("fs");
var path = require("path");
var _ = require('underscore');

var files = require('../files.js');
var selftest = require('../selftest.js');
var Sandbox = selftest.Sandbox;

var checkMobileServer = function (s, expected) {
  var output = s.read("android/assets/www/application/index.html");
  if (! output.match(new RegExp(
    '"DDP_DEFAULT_CONNECTION_URL":"' + expected + '"'))) {
    selftest.fail(
      "Wrong DDP_DEFAULT_CONNECTION_URL; expected " + expected);
  }
};

var cleanUpBuild = function (s) {
  files.rm_recursive(path.join(s.cwd, "android"));
  fs.unlinkSync(path.join(s.cwd, "myapp.tar.gz"));
};

selftest.define("cordova builds with server options", ["slow"], function () {
  var s = new Sandbox();
  var run;

  s.createApp("myapp", "standard-app");
  s.cd("myapp");
  run = s.run("add-platform", "android");
  run.match("Do you agree");
  run.write("Y\n");
  run.extraTime = 90; // Huge download
  run.match("added");
  run.expectExit(0);

  run = s.run("build", ".");
  run.waitSecs(90);
  run.matchErr(
    "Supply the server hostname and port in the --mobile-server option");
  run.expectExit(1);

  run = s.run("build", ".", "--mobile-server", "5000");
  run.waitSecs(90);
  run.expectExit(0);
  checkMobileServer(s, "http://localhost:5000");
  cleanUpBuild(s);

  run = s.run("build", ".", "--mobile-server", "https://example.com:5000");
  run.waitSecs(90);
  run.expectExit(0);
  checkMobileServer(s, "https://example.com:5000");
  cleanUpBuild(s);

  run = s.run("build", ".", "--mobile-server", "example.com:5000");
  run.waitSecs(90);
  run.expectExit(0);
  checkMobileServer(s, "http://example.com:5000");
  cleanUpBuild(s);

  // XXX COMPAT WITH 0.9.2.2
  run = s.run("build", ".", "--mobile-port", "example.com:5000");
  run.waitSecs(90);
  run.expectExit(0);
  checkMobileServer(s, "http://example.com:5000");
  cleanUpBuild(s);
});
