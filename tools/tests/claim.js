var selftest = require('../selftest.js');
var testUtils = require('../test-utils.js');
var Sandbox = selftest.Sandbox;
var files = require('../files.js');

var commandTimeoutSecs = testUtils.accountsCommandTimeoutSecs;

var loggedInError = selftest.markStack(function(run) {
  run.waitSecs(commandTimeoutSecs);
  run.matchErr("You must be logged in to claim sites.");
  run.expectExit(1);
});

var waitAndError = selftest.markStack(function(run, errmsg) {
  run.waitSecs(commandTimeoutSecs);
  run.matchErr(errmsg);
  run.expectExit(1);
});

selftest.define("claim", ['net', 'slow'], function () {
  var s = new Sandbox;

  // Can't claim sites while logged out.
  // Nonexistent site.
  var run = s.run('claim', testUtils.randomAppName(20));
  loggedInError(run);

  // Can't claim sites without specifying a site
  run = s.run('claim');
  run.matchErr('not enough arguments');
  run.expectExit(1);

  // Existing site.
  run = s.run('claim', 'mother-test');
  loggedInError(run);

  // Claim will not work on non-legacy sites.
  // belongs to me.
  testUtils.login(s, "test", "testtest");
  var appName = testUtils.createAndDeployApp(s);
  run = s.run('claim', appName);
  waitAndError(run, "That site already belongs to you.");

  // belongs to not me.
  testUtils.logout(s);
  testUtils.login(s, "testtest", "testtest");
  run = s.run('claim', appName);
  waitAndError(run, "Sorry, that site belongs to someone else.");

  // belongs to not me, but I am authorized.
  testUtils.logout(s);
  testUtils.login(s, "test", "testtest");
  run = s.run('authorized', appName, '--add', 'testtest');
  run.waitSecs(commandTimeoutSecs);
  run.match('added');
  run.expectExit(0);
  testUtils.logout(s);
  testUtils.login(s, "testtest", "testtest");
  run = s.run('claim', appName);
  waitAndError(run, "That site already belongs to you.");

  testUtils.cleanUpApp(s, appName);

  // Legacy sites.
  var sLegacy;
  if (files.inCheckout()) {
    sLegacy = new Sandbox({
      // Include a warehouse argument so that we can deploy apps with
      // --release arguments.
      warehouse: {
        v1: { tools: 'tool1', latest: true }
      }
    });
  } else {
    sLegacy = new Sandbox;
  }

  // legacy w/pwd.
  var pwd = testUtils.randomString(10);
  var legacyApp = testUtils.createAndDeployLegacyApp(sLegacy, pwd);

  run = s.run('claim', legacyApp);
  run.waitSecs(commandTimeoutSecs);
  run.matchErr('Password: ');
  run.write('badpass\n');
  run.waitSecs(commandTimeoutSecs);
  run.matchErr("Couldn't claim site:");
  run.expectExit(1);

  run = s.run('claim', legacyApp);
  run.waitSecs(commandTimeoutSecs);
  run.matchErr('Password:');
  run.write(pwd+"\n");
  run.waitSecs(commandTimeoutSecs);
  run.match("successfully transferred to your account");
  run.expectExit(0);

  testUtils.cleanUpApp(s, legacyApp);

  // legacy w/o pwd.
  legacyApp = testUtils.createAndDeployLegacyApp(sLegacy);

  run = s.run('claim', legacyApp);
  run.waitSecs(commandTimeoutSecs);
  run.match("successfully transferred to your account");
  run.expectExit(0);

  // No site deployed.
  run = s.run('claim', testUtils.randomAppName(20));
  waitAndError(run, "There isn't a site deployed at that address.");

  testUtils.cleanUpApp(s, legacyApp);
  testUtils.logout(s);
});

selftest.define('claim - no username', ['net', 'slow'], function () {
  var s = new Sandbox;
  var sandboxWithWarehouse;
  if (files.inCheckout()) {
    sandboxWithWarehouse = new Sandbox({
      // Include a warehouse argument so that we can deploy apps with
      // --release arguments.
      warehouse: {
        v1: { tools: 'tool1', latest: true }
      }
    });
  } else {
    sandboxWithWarehouse = new Sandbox;
  }

  // We shouldn't be able to claim sites before we set a username.
  var email = testUtils.randomUserEmail();
  var username = testUtils.randomString(10);
  var appName = testUtils.randomAppName();
  var token = testUtils.deployWithNewEmail(s, email, appName);
  var legacyAppName = testUtils.createAndDeployLegacyApp(
    sandboxWithWarehouse,
    'test'
  );
  var run = s.run('claim', legacyAppName);
  run.waitSecs(commandTimeoutSecs);
  run.matchErr('Password:');
  run.write('test\n');
  run.waitSecs(commandTimeoutSecs);
  run.matchErr('You need to set a password');
  run.matchErr(testUtils.registrationUrlRegexp);
  run.expectExit(1);
  // After we set a username, we should be able to claim sites.
  testUtils.registerWithToken(token, username, 'testtest', email);
  run = s.run('claim', legacyAppName);
  run.waitSecs(commandTimeoutSecs);
  run.matchErr('Password: ');
  run.write('test\n');
  run.waitSecs(commandTimeoutSecs);
  run.match('transferred to your account');
  run.expectExit(0);
  testUtils.cleanUpApp(s, appName);
  testUtils.cleanUpApp(s, legacyAppName);
  testUtils.logout(s);
});
