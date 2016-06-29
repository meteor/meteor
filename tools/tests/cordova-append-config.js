var files = require('../fs/files.js');
var selftest = require('../tool-testing/selftest.js');
var testUtils = require('../tool-testing/test-utils.js');
var Sandbox = selftest.Sandbox;

var cleanUpBuild = function (s) {
  files.rm_recursive(files.pathJoin(s.cwd, "android"));
  files.unlink(files.pathJoin(s.cwd, "myapp.tar.gz"));
};

selftest.define("cordova builds extended config.xml", ["cordova", "slow"], function () {
  var s = new Sandbox();
  var run;

  s.createApp("myapp", "standard-app");
  s.cd("myapp");

  run = s.run("add-platform", "android");
  run.waitSecs(100);
  run.match("added");
  run.expectExit(0);

  // Write mobile-config.js
  var mobileConfig = "App.appendToConfig('<something/>')";
  files.writeFile(s.cwd + '/mobile-config.js', mobileConfig, "utf8");

  run = s.run("build", ".", "--server", "example.com");
  run.waitSecs(300);
  run.expectExit(0);

  // Read and check if custom XML was included
  var configXML = files.readFile(s.cwd + '/.meteor/local/cordova-build/config.xml');
  selftest.expectEqual((/<something\/>/g).test(configXML), true);
  cleanUpBuild(s);
});
