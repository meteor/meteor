var files = require('../files.js');
var selftest = require('../selftest.js');
var testUtils = require('../test-utils.js');
var Sandbox = selftest.Sandbox;

var checkMobileServer = selftest.markStack(function (s, expected) {
  var output = s.read("android/project/assets/www/application/index.html");
  var mrc = testUtils.getMeteorRuntimeConfigFromHTML(output);
  selftest.expectEqual(mrc.DDP_DEFAULT_CONNECTION_URL, expected);
});

var cleanUpBuild = function (s) {
  files.rm_recursive(files.pathJoin(s.cwd, "android"));
  files.unlink(files.pathJoin(s.cwd, "myapp.tar.gz"));
};

selftest.define("cordova builds with server options", ["cordova", "slow"], function () {
  var s = new Sandbox();
  var run;

  s.createApp("myapp", "standard-app");
  s.cd("myapp");

  run = s.run("install-sdk", "android");
  run.waitSecs(90); // Huge download
  run.expectExit(0);

  run = s.run("add-platform", "android");
  run.match("Do you agree");
  run.write("Y\n");
  run.waitSecs(90); // Huge download
  run.match("added");
  run.expectExit(0);

  run = s.run("build", ".");
  run.waitSecs(90);
  run.matchErr(
    "Supply the server hostname and port in the --server option");
  run.expectExit(1);

  run = s.run("build", ".", "--server", "5000");
  run.waitSecs(90);
  run.matchErr("--server must include a hostname");
  run.expectExit(1);

  run = s.run("build", ".", "--server", "https://example.com:5000");
  run.waitSecs(300);
  run.expectExit(0);
  checkMobileServer(s, "https://example.com:5000");
  cleanUpBuild(s);

  run = s.run("build", ".", "--server", "example.com:5000");
  run.waitSecs(90);
  run.expectExit(0);
  checkMobileServer(s, "http://example.com:5000");
  cleanUpBuild(s);

  run = s.run("build", ".", "--server", "example.com");
  run.waitSecs(90);
  run.expectExit(0);
  checkMobileServer(s, "http://example.com");
  cleanUpBuild(s);

  run = s.run("build", ".", "--server", "https://example.com");
  run.waitSecs(90);
  run.expectExit(0);
  checkMobileServer(s, "https://example.com");
  cleanUpBuild(s);

  // XXX COMPAT WITH 0.9.2.2
  run = s.run("build", ".", "--mobile-port", "example.com:5000");
  run.waitSecs(90);
  run.expectExit(0);
  checkMobileServer(s, "http://example.com:5000");
  cleanUpBuild(s);
});
