var _ = require('underscore');
var selftest = require('../tool-testing/selftest.js');
var testUtils = require('../tool-testing/test-utils.js');
var galaxyUtils = require('../tool-testing/galaxy-utils.js');
var Sandbox = selftest.Sandbox;

// XXX: There is currently no cleanup function in self-test, but it would be
// nice to have.

// Check if a given app is running. Curl that appname and see that it returns
// some text.
//
//  - appUrl: the URL at which the app is (theoretically) running. For example
//    "xxx.galaxy.meteor.com"
//  - checks: what to check for. Following options:
//    - text: text in the HTTP response of the app
//    - containerCount: number of containers GalaxyAPI thinks is running
var checkAppIsRunning = selftest.markStack(function (appUrl, checks) {
  var containerCount = checks.containerCount || 1;
  var text = checks.text;

  // Check that GalaxyAPI thinks that we are running the correct containers.
  var appRecord = galaxyUtils.getAppRecordByName(appUrl);
  selftest.expectEqual(appRecord.containerCount, containerCount);

  // Ignore HTTP checks, and that's what this is.
  if (! galaxyUtils.ignoreHttpChecks()) {
    // Test that the app is actually running on Galaxy.
    var run = galaxyUtils.curlToGalaxy(appUrl);
    run.waitSecs(5);
    run.matchErr(galaxyUtils.httpOK);
    run.match(text);
    run.expectExit(0);
  }
});

// Deploy a simple app to Galaxy.
selftest.define('galaxy deploy - simple', ['galaxy'], function () {
  galaxyUtils.sanityCheck();
  var s = new Sandbox;

  // Login with a valid Galaxy account
  galaxyUtils.loginToGalaxy(s);

  // Deploy an app.
   var appName = galaxyUtils.createAndDeployApp(s);

  // Test that the app is actually running on Galaxy.
  checkAppIsRunning(appName, { text: "Hello" });

  // Edit the app. Use words that are unlikely to show up in (for example)
  // boilerplate 404 text.
  var newText =
    "<head> second </head>" + "\n" +
    "<body> deploying rocks! </body>";
  s.write("simple.html", newText);

  // Let's use normal deploy here.
  var run = s.run("deploy", appName);
  run.waitSecs(15);
  run.expectExit(0);
  galaxyUtils.waitForContainers();
  checkAppIsRunning(appName, { text: "second" });

  // Delete our deployed app.
  galaxyUtils.cleanUpApp(s, appName);

  // Test that the app is no longer running.
  // Check that GalaxyAPI thinks that we are running the correct containers.
  if (! galaxyUtils.ignoreHttpChecks()) {
    run = galaxyUtils.curlToGalaxy(appName);
    run.waitSecs(5);
    run.matchErr("404");
    run.expectExit(0);
  }

  testUtils.logout(s);
});

// Deploy an app with some public settings to galaxy, check that everything works.
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
  checkAppIsRunning(appName, { text: "Hello" });

  // Test that the public settings appear in the HTTP response body.
  if (! galaxyUtils.ignoreHttpChecks()) {
    testUtils.checkForSettings(appName, settings, 10);
  }

  // Re-deploy without settings and check that the settings still
  // appear.
  s.cd('..');
  galaxyUtils.createAndDeployApp(s, {
    templateApp: 'standard-app',
    appName: appName,
    useOldSettings: true
  });
  if (! galaxyUtils.ignoreHttpChecks()) {
    testUtils.checkForSettings(appName, settings, 10);
  }

  // Re-deploy with new settings and check that the settings get
  // updated.
  settings['public'].a = 'c';
  s.cd('..');
  galaxyUtils.createAndDeployApp(s, {
    templateApp: 'simple-app',
    appName: appName,
    settings: settings
  });
  checkAppIsRunning(appName, { text: "Hello" });

  galaxyUtils.cleanUpApp(s, appName);
  testUtils.logout(s);
});


// Rescale the app and check status.
selftest.define('galaxy deploy - rescale', ['galaxy'], function () {
  galaxyUtils.sanityCheck();
  var s = new Sandbox;

  // Login with a valid Galaxy account
  galaxyUtils.loginToGalaxy(s);

  // Deploy an app.
  var appName = galaxyUtils.createAndDeployApp(s);
  checkAppIsRunning(appName, { text: "Hello" });

  // Call into the Galaxy API DDP methods to rescale containers. The method
  // signature is:
  //    setContainerCount: function(appId, containerCount)
  var conn = galaxyUtils.loggedInGalaxyAPIConnection();
  var appRecord = galaxyUtils.getAppRecordByName(appName);
  galaxyUtils.callGalaxyAPI(conn, "setContainerCount", appRecord._id, 5);
  galaxyUtils.waitForContainers();
  checkAppIsRunning(appName, { text: "Hello", containerCount : 5 });

  // More throughly: check that as far as we know, containers are actually
  // running (or the scheduler is lying to GalaxyAPI and claiming that they are
  // running). This API is even more internal, but it is unlikely to change for
  // now.
  // XXX: This subscription is not yet worth checking on staging, when it is, uncomment.
  /// var containers = galaxyUtils.getAppContainerStatuses(appRecord._id, appName);
  // selftest.equals(containers.length, 5);

  // Now, scale down the app.
  galaxyUtils.callGalaxyAPI(conn, "setContainerCount", appRecord._id, 1);
  galaxyUtils.waitForContainers();
  checkAppIsRunning(appName, { text: "Hello", containerCount : 1 });

  // Delete the app.
  galaxyUtils.cleanUpApp(s, appName);

  // Check that no containers are running.
  conn = galaxyUtils.renewConnection(conn);
  // XXX: This subscription is not yet worth checking on staging, when it is, uncomment.
  // containers = galaxyUtils.getAppContainerStatuses(appRecord._id, appName);
  // selftest.expectEqual(0, containers.length);

  // Logout.
  galaxyUtils.closeGalaxyConnection(conn);
  testUtils.logout(s);
});

// Upload an app, allocate it a self-signed cert, check that we get https
// redirection.
selftest.define('galaxy self-signed cert', ['galaxy'], function () {
  galaxyUtils.sanityCheck();
  var s = new Sandbox;

  // Login with a valid Galaxy account
  galaxyUtils.loginToGalaxy(s);

  // Deploy an app. Check that it is running.
  var appName = galaxyUtils.createAndDeployApp(s);
  checkAppIsRunning(appName, { text: "Hello" });

  // Force SSL.
  var run = s.run("add", "force-ssl");
  run.waitSecs(5);
  run.expectExit(0);
  run = s.run("deploy", appName);
  run.waitSecs(30);
  run.expectExit(0);
  galaxyUtils.waitForContainers();

  // Create a signed certificate for the app.
  //  createSelfSignedCertificateForApp: function (appId, options) {
  var appRecord = galaxyUtils.getAppRecordByName(appName);
  var conn = galaxyUtils.loggedInGalaxyAPIConnection();
  var certIds = _.map(_.range(0, 15), function () {
    return galaxyUtils.callGalaxyAPI(
      conn, "createSelfSignedCertificateForApp", appRecord._id);
  });

  // Activate a certificate in the middle -- not the first or the last.
  galaxyUtils.callGalaxyAPI(
    conn, "activateCertificateForApp", certIds[3], appRecord._id);
  // Check that we are getting a re-direct.
  galaxyUtils.waitForContainers();
  appRecord = galaxyUtils.getAppRecordByName(appName);
  selftest.expectEqual(appRecord.containerCount, 1);
  var activeCert = appRecord["activeCertificateId"];
  selftest.expectEqual(activeCert, certIds[3]);
  if (! galaxyUtils.ignoreHttpChecks()) {
    run = galaxyUtils.curlToGalaxy(appName);
    run.waitSecs(5);
    run.matchErr("SSL");
    run.expectExit(60);
  }

  // Remove the un-activated certificates
  _.each(_.range(0, 15), function (i) {
    if (i !== 3) {
      galaxyUtils.callGalaxyAPI(
        conn, "removeCertificateFromApp", certIds[i], appRecord._id);
    }
  });
  // Check that we are still getting a re-direct and GalaxyAPI thinks that we
  // are using the same cert.
  appRecord = galaxyUtils.getAppRecordByName(appName);
  selftest.expectEqual(appRecord["activeCertificateId"], activeCert);
  if (! galaxyUtils.ignoreHttpChecks()) {
    run = galaxyUtils.curlToGalaxy(appName);
    run.waitSecs(5);
    run.matchErr("SSL");
    run.expectExit(60);
  }

  // Clean up.
  galaxyUtils.cleanUpApp(s, appName);
  testUtils.logout(s);
  galaxyUtils.closeGalaxyConnection(conn);
});

// Unauthorized users cannot deploy to Galaxy.
selftest.define('unauthorized deploy', ['galaxy'], function () {
  var sandbox = new Sandbox;
  // This is the test user. The test user is not currently authorized to deploy
  // to Galaxy. Sorry, test user! :( Hopefully, someday.
  testUtils.login(sandbox, 'test', 'testtest');

  var appName = testUtils.randomAppName();
  sandbox.createApp(appName, 'empty');
  sandbox.cd(appName);
  var run = sandbox.run("deploy", appName);
  run.waitSecs(90);
  run.matchErr("Error deploying");
  run.matchErr("is not authorized");
  run.expectExit(1);
});
