var files = require('../files.js');
var selftest = require('../selftest.js');
var _ = require('underscore');
var Sandbox = selftest.Sandbox;


selftest.define("windows prints correct message when it can't do mobile things - add-platform, install-sdk, configure-android, android-launch", ["windows"], function () {
  var s = new Sandbox();

  var run;

  s.createApp("myapp", "standard-app");
  s.cd("myapp", function () {
    _.each(['add-platform', 'install-sdk'], function (command) {
      _.each(['ios', 'android'], function (platform) {
        run = s.run(command, platform);
        // We print some warning that involves saying you're on Windows
        run.matchErr("Windows");
      });
    });
    _.each(['configure-android', 'android-launch'], function (command) {
      run = s.run(command);
      run.matchErr("Windows");
    });
  });
});

selftest.define("windows prints correct message when it can't do mobile things - build", ["windows"], function () {
  var s = new Sandbox();

  var run;

  s.createApp("mobile-app", "mobile-platforms");
  s.cd("mobile-app");
  run = s.run("build", ".build", "--server", "https://foo.com");
  run.waitSecs(20);
  run.matchErr("Windows");
});

selftest.define("windows prints correct message when it can't do mobile things - run, remove-platform", ["windows"], function () {
  var s = new Sandbox();

  var run;

  s.createApp("mobile-app", "mobile-platforms");
  s.cd("mobile-app");
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
