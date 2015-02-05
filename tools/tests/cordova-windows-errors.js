var files = require('../files.js');
var selftest = require('../selftest.js');
var _ = require('underscore');
var Sandbox = selftest.Sandbox;


selftest.define("windows prints correct message when it can't do mobile things", ["windows"], function () {
  var s = new Sandbox();

  var run;

  s.createApp("myapp", "standard-app");
  s.cd("myapp", function () {
    _.each(['add-platform'], function (command) {
      _.each(['ios', 'android'], function (platform) {
        run = s.run(command, platform);
        // We print some warning that involves saying you're on Windows
        run.matchErr("Windows");
      });
    });
  });

  s.run("create", "--example", "todos");
  s.cd("todos", function () {
    run = s.run("build", ".build", "--server", "https://foo.com");
    run.matchErr("Windows");
    _.each(['ios', 'android', 'ios-device', 'android-device'], function (platform) {
      run = s.run('run', platform);
      // We print some warning that involves saying you're on Windows
      run.matchErr("Windows");
    });
    _.each(['ios', 'android'], function (platform) {
      run = s.run('remove-platform', platform);
      run.match('removed platform');
    });
  });
});
