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
var checkAppIsRunning = selftest.markStack(async function (appUrl, checks) {
  var containerCount = checks.containerCount || 1;
  var text = checks.text;

  // Check that GalaxyAPI thinks that we are running the correct containers.
  var appRecord = galaxyUtils.getAppRecordByName(appUrl);
  await selftest.expectEqual(appRecord.containerCount, containerCount);

  // Ignore HTTP checks, and that's what this is.
  if (! galaxyUtils.ignoreHttpChecks()) {
    // Test that the app is actually running on Galaxy.
    var run = galaxyUtils.curlToGalaxy(appUrl);
    run.waitSecs(5);
    await run.matchErr(galaxyUtils.httpOK);
    await run.match(text);
    await run.expectExit(0);
  }
});

// Deploy a simple app to Galaxy.
selftest.define('galaxy deploy - simple', ['galaxy'], async function () {
  galaxyUtils.sanityCheck();
  var s = new Sandbox;
  await s.init();

  // Login with a valid Galaxy account
  await galaxyUtils.loginToGalaxy(s);

  // Deploy an app.
  var appName = await galaxyUtils.createAndDeployApp(s);

  // Test that the app is actually running on Galaxy.
  await checkAppIsRunning(appName, { text: "Hello" });

  // Edit the app. Use words that are unlikely to show up in (for example)
  // boilerplate 404 text.
  var newText =
    "<head> second </head>" + "\n" +
    "<body> deploying rocks! </body>";
  s.write("simple.html", newText);

  // Let's use normal deploy here.
  var run = s.run("deploy", appName);
  run.waitSecs(15);
  await run.expectExit(0);
  await galaxyUtils.waitForContainers();
  await checkAppIsRunning(appName, { text: "second" });

  // Delete our deployed app.
  await galaxyUtils.cleanUpApp(s, appName);

  // Test that the app is no longer running.
  // Check that GalaxyAPI thinks that we are running the correct containers.
  if (! galaxyUtils.ignoreHttpChecks()) {
    run = galaxyUtils.curlToGalaxy(appName);
    run.waitSecs(5);
    await run.matchErr("404");
    await run.expectExit(0);
  }

  await testUtils.logout(s);
});

// Deploy an app with some public settings to galaxy, check that everything works.
selftest.define('galaxy deploy - settings', ['galaxy'], async function () {
  galaxyUtils.sanityCheck();
  var s = new Sandbox;
  await s.init();

  // Login with a valid Galaxy account
  await galaxyUtils.loginToGalaxy(s);

  // Create sample settings.
  var settings = {
    'public': { a: 'b' }
  };

  // Deploy an app with settings and check that the public settings
  // appear in the HTTP response body.
  var appName = await galaxyUtils.createAndDeployApp(s, {
    settings: settings
  });

  // Test that the app is actually running on Galaxy.
  await checkAppIsRunning(appName, { text: "Hello" });

  // Test that the public settings appear in the HTTP response body.
  if (! galaxyUtils.ignoreHttpChecks()) {
    await testUtils.checkForSettings(appName, settings, 10);
  }

  // Re-deploy without settings and check that the settings still
  // appear.
  s.cd('..');
  await galaxyUtils.createAndDeployApp(s, {
    templateApp: 'standard-app',
    appName: appName,
    useOldSettings: true
  });
  if (! galaxyUtils.ignoreHttpChecks()) {
    await testUtils.checkForSettings(appName, settings, 10);
  }

  // Re-deploy with new settings and check that the settings get
  // updated.
  settings['public'].a = 'c';
  s.cd('..');
  await galaxyUtils.createAndDeployApp(s, {
    templateApp: 'simple-app',
    appName: appName,
    settings: settings
  });
  await checkAppIsRunning(appName, { text: "Hello" });

  await galaxyUtils.cleanUpApp(s, appName);
  await testUtils.logout(s);
});


// Rescale the app and check status.
selftest.define('galaxy deploy - rescale', ['galaxy'], async function () {
  galaxyUtils.sanityCheck();
  var s = new Sandbox;
  await s.init();


  // Login with a valid Galaxy account
  await galaxyUtils.loginToGalaxy(s);

  // Deploy an app.
  var appName = await galaxyUtils.createAndDeployApp(s);
  await checkAppIsRunning(appName, { text: "Hello" });

  // Call into the Galaxy API DDP methods to rescale containers. The method
  // signature is:
  //    setContainerCount: function(appId, containerCount)
  var conn = await galaxyUtils.loggedInGalaxyAPIConnection();
  var appRecord = await galaxyUtils.getAppRecordByName(appName);
  await galaxyUtils.callGalaxyAPI(conn, "setContainerCount", appRecord._id, 5);
  await galaxyUtils.waitForContainers();
  await checkAppIsRunning(appName, { text: "Hello", containerCount : 5 });

  // More throughly: check that as far as we know, containers are actually
  // running (or the scheduler is lying to GalaxyAPI and claiming that they are
  // running). This API is even more internal, but it is unlikely to change for
  // now.
  // XXX: This subscription is not yet worth checking on staging, when it is, uncomment.
  /// var containers = galaxyUtils.getAppContainerStatuses(appRecord._id, appName);
  // selftest.equals(containers.length, 5);

  // Now, scale down the app.
  await galaxyUtils.callGalaxyAPI(conn, "setContainerCount", appRecord._id, 1);
  await galaxyUtils.waitForContainers();
  await checkAppIsRunning(appName, { text: "Hello", containerCount : 1 });

  // Delete the app.
  await galaxyUtils.cleanUpApp(s, appName);

  // Check that no containers are running.
  conn = await galaxyUtils.renewConnection(conn);
  // XXX: This subscription is not yet worth checking on staging, when it is, uncomment.
  // containers = galaxyUtils.getAppContainerStatuses(appRecord._id, appName);
  // selftest.expectEqual(0, containers.length);

  // Logout.
  await galaxyUtils.closeGalaxyConnection(conn);
  await testUtils.logout(s);
});

// Upload an app, allocate it a self-signed cert, check that we get https
// redirection.
selftest.define('galaxy self-signed cert', ['galaxy'], async function () {
  galaxyUtils.sanityCheck();
  var s = new Sandbox;
  await s.init();

  // Login with a valid Galaxy account
  await galaxyUtils.loginToGalaxy(s);

  // Deploy an app. Check that it is running.
  var appName = await galaxyUtils.createAndDeployApp(s);
  await checkAppIsRunning(appName, { text: "Hello" });

  // Force SSL.
  var run = s.run("add", "force-ssl");
  run.waitSecs(5);
  await run.expectExit(0);
  run = s.run("deploy", appName);
  run.waitSecs(30);
  await run.expectExit(0);
  galaxyUtils.waitForContainers();

  // Create a signed certificate for the app.
  //  createSelfSignedCertificateForApp: function (appId, options) {
  var appRecord = galaxyUtils.getAppRecordByName(appName);
  var conn = await galaxyUtils.loggedInGalaxyAPIConnection();
  var certIds = [];
  for (let range = 0; range <= 14; range++) {
    certIds.push(await galaxyUtils.callGalaxyAPI(
        conn, "createSelfSignedCertificateForApp", appRecord._id));
  }

  // Activate a certificate in the middle -- not the first or the last.
  await galaxyUtils.callGalaxyAPI(
    conn, "activateCertificateForApp", certIds[3], appRecord._id);
  // Check that we are getting a re-direct.
  await galaxyUtils.waitForContainers();
  appRecord = await galaxyUtils.getAppRecordByName(appName);
  await selftest.expectEqual(appRecord.containerCount, 1);
  var activeCert = appRecord["activeCertificateId"];
  await selftest.expectEqual(activeCert, certIds[3]);
  if (! galaxyUtils.ignoreHttpChecks()) {
    run = await galaxyUtils.curlToGalaxy(appName);
    run.waitSecs(5);
    await run.matchErr("SSL");
    await run.expectExit(60);
  }

  // Remove the un-activated certificates
  for (let i = 0; i <= 14; i++) {
    if (i !== 3) {
      await galaxyUtils.callGalaxyAPI(
          conn, "removeCertificateFromApp", certIds[i], appRecord._id);
    }
  }
  // Check that we are still getting a re-direct and GalaxyAPI thinks that we
  // are using the same cert.
  appRecord = await galaxyUtils.getAppRecordByName(appName);
  await selftest.expectEqual(appRecord["activeCertificateId"], activeCert);
  if (! galaxyUtils.ignoreHttpChecks()) {
    run = galaxyUtils.curlToGalaxy(appName);
    run.waitSecs(5);
    await run.matchErr("SSL");
    await run.expectExit(60);
  }

  // Clean up.
  await galaxyUtils.cleanUpApp(s, appName);
  await testUtils.logout(s);
  await galaxyUtils.closeGalaxyConnection(conn);
});

// Unauthorized users cannot deploy to Galaxy.
selftest.define('unauthorized deploy', ['galaxy'], async function () {
  var sandbox = new Sandbox;
  await sandbox.init();
  // This is the test user. The test user is not currently authorized to deploy
  // to Galaxy. Sorry, test user! :( Hopefully, someday.
  await testUtils.login(sandbox, 'test', 'testtest');

  var appName = testUtils.randomAppName();
  await sandbox.createApp(appName, 'empty');
  sandbox.cd(appName);
  var run = sandbox.run("deploy", appName);
  run.waitSecs(90);
  await run.matchErr("Error deploying");
  await run.matchErr("is not authorized");
  await run.expectExit(1);
});
