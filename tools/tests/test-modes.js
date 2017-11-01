var selftest = require('../tool-testing/selftest.js');
var Sandbox = selftest.Sandbox;

selftest.define("'meteor test --port' accepts/rejects proper values", function () {
  var s = new Sandbox();
  var run;

  s.createApp("myapp", "standard-app");
  s.cd("myapp");
  s.set("")

  var runAddPackage = s.run("add", "tmeasday:acceptance-test-driver");
  runAddPackage.waitSecs(30);
  runAddPackage.match(/tmeasday:acceptance-test-driver\b.*?added/)
  runAddPackage.expectExit(0);

  run = s.run("test", "--port", "3700", "--driver-package", "tmeasday:acceptance-test-driver");
  run.waitSecs(120);
  run.match('App running at: http://localhost:3700/');
  run.stop();

  run = s.run("test", "--port", "127.0.0.1:3700", "--driver-package", "tmeasday:acceptance-test-driver");
  run.waitSecs(120);
  run.match('App running at: http://127.0.0.1:3700/');
  run.stop();

  run = s.run("test", "--port", "[::]:3700", "--driver-package", "tmeasday:acceptance-test-driver");
  run.waitSecs(120);
  run.match('App running at: http://[::]:3700/');
  run.stop();
});
