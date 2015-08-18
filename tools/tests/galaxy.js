var _ = require('underscore');
var selftest = require('../tool-testing/selftest.js');
var testUtils = require('../tool-testing/test-utils.js');
var galaxyUtils = require('../tool-testing/galaxy-utils.js');
var Sandbox = selftest.Sandbox;

// XXX: There is currently no cleanup function in self-test, I will get to it if
// I have time.

// Deploy a simple app to Galaxy.
selftest.define('galaxy deploy - simple', ['galaxy'], function () {
  galaxyUtils.sanityCheck();
  var s = new Sandbox;

  // Login with a valid Galaxy account
  galaxyUtils.loginToGalaxy(s);

  // Deploy an app.
   var appName = galaxyUtils.createAndDeployApp(s);

  // Test that the app is actually running on Galaxy.
  var run = galaxyUtils.curlToGalaxy(appName);
  run.waitSecs(5);
  run.matchErr(galaxyUtils.httpOK);
  run.match("Hello");
  run.expectExit(0);

  // Delete our deployed app.
  galaxyUtils.cleanUpApp(s, appName);

  // Test that the app is no longer running.
  run = galaxyUtils.curlToGalaxy(appName);
  run.waitSecs(5);
  run.matchErr("404");
  run.expectExit(0);

  testUtils.logout(s);
});

selftest.define('galaxy deploy - settings', ['galaxy'], function () {
  galaxyUtils.sanityCheck();
  var s = new Sandbox;

  // Login with a valid Galaxy account
  galaxyUtils.loginToGalaxy(s);

  // Create sample settings.
  var settings = {
    'public': { a: 'b' }
  };

  // Deploy an app with settings and check that the public settings
  // appear in the HTTP response body.
  var appName = galaxyUtils.createAndDeployApp(s, {
    settings: settings
  });

  // Test that the app is actually running on Galaxy.
  var run = galaxyUtils.curlToGalaxy(appName);
  run.waitSecs(5);
  run.matchErr(galaxyUtils.httpOK);
  run.match("Hello");
  run.expectExit(0);

  // Test that the public settins appear in the HTTP response body.
  testUtils.checkForSettings(appName, settings, 10);

  // Re-deploy without settings and check that the settings still
  // appear.
  s.cd('..');
  galaxyUtils.createAndDeployApp(s, {
    templateApp: 'standard-app',
    appName: appName,
    useOldSettings: true
  });
  testUtils.checkForSettings(appName, settings, 10);

  // Re-deploy with new settings and check that the settings get
  // updated.
  settings['public'].a = 'c';
  s.cd('..');
  galaxyUtils.createAndDeployApp(s, {
    templateApp: 'standard-app',
    appName: appName,
    settings: settings
  });
  testUtils.checkForSettings(appName, settings, 10);

  galaxyUtils.cleanUpApp(s, appName);
  testUtils.logout(s);
});




// Tests that we want to have on Galaxy:
//  - deploy and add SSL cert
//  - rescale
//  - deploy app multiple times, see that it updates
//  - rescale & cert
//  - destroy an app on galaxy

// Infrastructure setup
//  - Read & set variable for deploy_hostname
//  - Read & set variables for username & password
//  - use DDP & such for great justice
