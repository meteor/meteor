var _ = require('underscore');
var selftest = require('../tool-testing/selftest.js');
var testUtils = require('../tool-testing/test-utils.js');
var galaxyUtils = require('../tool-testing/galaxy-utils.js');
var Sandbox = selftest.Sandbox;

// Deploy an app to Galaxy.
//
// XXX: Is there a cleanup phase in self-test? I would like to clean up the
// deploy even when it goes wrong.
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
  testUtils.cleanUpApp(s, appName);
  testUtils.logout(s);
});

// Tests that we want to have on Galaxy:
//  - deploy
//  - deploy with settings
//  - deploy and add SSL cert
//  - rescale
//  - deploy app multiple times, see that it updates
//  - rescale & cert
//  - destroy an app on galaxy

// Infrastructure setup
//  - Read & set variable for deploy_hostname
//  - Read & set variables for username & password
//  - use DDP & such for great justice
