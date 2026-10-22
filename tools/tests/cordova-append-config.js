var files = require('../fs/files');
var selftest = require('../tool-testing/selftest.js');
var Sandbox = selftest.Sandbox;

var cleanUpBuild = async function (s) {
  await files.rm_recursive(files.pathJoin(s.cwd, "android"));
  files.unlink(files.pathJoin(s.cwd, "myapp.tar.gz"));
};

selftest.define("cordova builds extended config.xml", ["cordova", "slow"], async function () {
  var s = new Sandbox();
  await s.init();

  var run;

  await s.createApp("myapp", "standard-app");
  s.cd("myapp");

  run = s.run("add-platform", "android");
  run.waitSecs(100);
  await run.match("added");
  await run.expectExit(0);

  // Write mobile-config.js
  var mobileConfig = "App.appendToConfig('<something/>')";
  files.writeFile(s.cwd + '/mobile-config.js', mobileConfig, "utf8");

  run = s.run("build", ".", "--server", "example.com");
  run.waitSecs(300);
  await run.expectExit(0);

  // Read and check if custom XML was included
  var configXML = files.readFile(s.cwd + '/.meteor/local/cordova-build/config.xml');
  await selftest.expectEqual((/<something\/>/g).test(configXML), true);
  await cleanUpBuild(s);
});
