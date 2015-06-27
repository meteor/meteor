var _ = require('underscore');
var selftest = require('../selftest.js');
var testUtils = require('../test-utils.js');
var utils = require('../utils.js');
var Sandbox = selftest.Sandbox;
var httpHelpers = require('../http-helpers.js');

// Poll the given app looking for the correct settings. Throws an error
// if the settings aren't found after a timeout.
var checkForSettings = selftest.markStack(function (appName, settings, timeoutSecs) {
  var timeoutDate = new Date(new Date().valueOf() + timeoutSecs * 1000);
  while (true) {
    if (new Date() >= timeoutDate) {
      selftest.fail('Expected settings not found on app ' + appName);
    }

    var result = httpHelpers.request('http://' + appName);

    // XXX This is brittle; the test will break if we start formatting the
    // __meteor_runtime_config__ JS differently. Ideally we'd do something
    // like point a phantom at the deployed app and actually evaluate
    // Meteor.settings.
    try {
      var mrc = testUtils.getMeteorRuntimeConfigFromHTML(result.body);
    } catch (e) {
      // ignore
      continue;
    }

    if (_.isEqual(mrc.PUBLIC_SETTINGS, settings['public'])) {
      return;
    }
  }
});

selftest.define('deploy - with settings', ['net', 'slow'], function () {
  var s = new Sandbox;
  testUtils.login(s, 'test', 'testtest');
  var settings = {
    'public': { a: 'b' }
  };
  s.write('settings.json', JSON.stringify(settings));

  // Deploy an app with settings and check that the public settings
  // appear in the HTTP response body.
  var appName = testUtils.createAndDeployApp(s, {
    // Use standard-app instead of empty because we actually want
    // standard-app-packages (including webapp) so that we can send a
    // HTTP request to the app and get a response.
    templateApp: 'standard-app',
    // The path is ../settings.json instead of settings.json because
    // createAndDeployApp creates a new app directory and cd's into it.
    settingsFile: '../settings.json'
  });
  checkForSettings(appName, settings, 10);

  // Re-deploy without settings and check that the settings still
  // appear.
  s.cd('..');
  testUtils.createAndDeployApp(s, {
    templateApp: 'standard-app',
    appName: appName
  });
  // It takes a few seconds for the app to actually update, and we don't
  // want to get a false positive in the meantime (i.e., if the settings
  // disappear, we don't want to send our request before the app has
  // updated and conclude that the settings are still there).
  utils.sleepMs(5000);
  checkForSettings(appName, settings, 10);

  // Re-deploy with new settings and check that the settings get
  // updated.
  settings['public'].a = 'c';
  s.cd('..');
  s.write('settings.json', JSON.stringify(settings));
  testUtils.createAndDeployApp(s, {
    templateApp: 'standard-app',
    settingsFile: '../settings.json',
    appName: appName
  });
  checkForSettings(appName, settings, 10);

  testUtils.cleanUpApp(s, appName);
  testUtils.logout(s);
});
