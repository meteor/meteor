var _ = require('underscore');
var selftest = require('../selftest.js');
var testUtils = require('../test-utils.js');
var files = require('../files.js');
var Sandbox = selftest.Sandbox;
var httpHelpers = require('../http-helpers.js');

var commandTimeoutSecs = testUtils.accountsCommandTimeoutSecs;

selftest.define('deploy - expired credentials', ['net', 'slow'], function () {
  var s = new Sandbox;
  // Create an account and then expire the login token before setting a
  // username. On the next deploy, we should get an email prompt
  // followed by a registration email, not a username prompt.
  var email = testUtils.randomUserEmail();
  var appName = testUtils.randomAppName();
  var token = testUtils.deployWithNewEmail(s, email, appName);
  var sessionFile = s.readSessionFile();
  testUtils.logout(s);
  s.writeSessionFile(sessionFile);
  var run = s.run('deploy', appName);
  run.waitSecs(commandTimeoutSecs);
  run.matchErr('Expired credential');
  run.expectExit(1);

  // Complete registration so that we can clean up our app.
  var username = testUtils.randomString(10);
  testUtils.registerWithToken(token, username,
                              'testtest', email);
  testUtils.login(s, username, 'testtest');
  testUtils.cleanUpApp(s, appName);
  testUtils.logout(s);

  // Create an account, set a username, expire the login token, and
  // deploy again. We should get a username/password prompt.
  email = testUtils.randomUserEmail();
  appName = testUtils.randomAppName();
  username = testUtils.randomString(10);
  token = testUtils.deployWithNewEmail(s, email, appName);
  testUtils.registerWithToken(token, username,
                              'testtest', email);
  run = s.run('whoami');
  run.waitSecs(commandTimeoutSecs);
  run.read(username + '\n');
  run.expectExit(0);

  sessionFile = s.readSessionFile();
  testUtils.logout(s);
  s.writeSessionFile(sessionFile);

  run = s.run('deploy', appName);
  run.waitSecs(commandTimeoutSecs);
  run.matchErr('Username:');
  run.write(username + '\n');
  run.matchErr('Password:');
  run.write('testtest' + '\n');
  run.waitSecs(90);
  run.expectExit(0);

  testUtils.cleanUpApp(s, appName);
  testUtils.logout(s);
});

selftest.define('deploy - bad arguments', [], function () {
  var s = new Sandbox;

  // Deploy with no app name should fail
  var run = s.run('deploy');
  run.matchErr('not enough arguments');
  run.expectExit(1);

  // Deploy outside of an app directory
  run = s.run('deploy', testUtils.randomAppName());
  run.matchErr('not in a Meteor project directory');
  run.expectExit(1);
});

selftest.define('deploy - logged in', ['net', 'slow'], function () {
  // Create two sandboxes: one with a warehouse so that we can run
  // --release, and one without a warehouse so that we run from the
  // checkout or release that we started from.
  // XXX Is having two sandboxes the only way to do this?
  var sandbox = new Sandbox;
  var sandboxWithWarehouse;
  if (files.inCheckout()) {
    sandboxWithWarehouse = new Sandbox({
      // Include a warehouse arugment so that we can deploy apps with
      // --release arguments.
      warehouse: {
        v1: { tools: 'tool1', latest: true }
      }
    });
  } else {
    sandboxWithWarehouse = new Sandbox;
  }
  sandbox.createApp('deployapp', 'empty');
  sandbox.cd('deployapp');

  // LEGACY APPS

  // Deploy a legacy app with no password
  var noPasswordLegacyApp = testUtils.createAndDeployLegacyApp(sandboxWithWarehouse);

  testUtils.login(sandbox, 'test', 'testtest');

  // Now, with our logged in current release, we should be able to
  // deploy to the legacy app.
  var run = sandbox.run('deploy', noPasswordLegacyApp);
  run.waitSecs(90);
  run.match('Now serving at ' + noPasswordLegacyApp + '.meteor.com');
  run.expectExit(0);
  // And we should have claimed the app by deploying to it.
  run = sandbox.run('claim', noPasswordLegacyApp);
  run.waitSecs(commandTimeoutSecs);
  run.matchErr('already belongs to you');
  run.expectExit(1);
  // Clean up
  testUtils.cleanUpApp(sandbox, noPasswordLegacyApp);

  // Deploy a legacy password-protected app
  var passwordLegacyApp = testUtils.createAndDeployLegacyApp(
    sandboxWithWarehouse,
    'test'
  );
  // We shouldn't be able to deploy to this app without claiming it
  run = sandbox.run('deploy', passwordLegacyApp);
  run.waitSecs(commandTimeoutSecs);
  run.matchErr('meteor claim');
  run.expectExit(1);
  // If we claim it, we should be able to deploy to it.
  run = sandbox.run('claim', passwordLegacyApp);
  run.waitSecs(commandTimeoutSecs);
  run.matchErr('Password:');
  run.write('test\n');
  run.waitSecs(commandTimeoutSecs);
  run.match('successfully transferred to your account');
  run.expectExit(0);
  run = sandbox.run('deploy', passwordLegacyApp);
  run.waitSecs(90);
  run.match('Now serving at ' + passwordLegacyApp + '.meteor.com');
  run.expectExit(0);
  // Clean up
  testUtils.cleanUpApp(sandbox, passwordLegacyApp);

  // NON-LEGACY APPS

  // Deploy an app.
  var appName = testUtils.createAndDeployApp(sandbox);

  // Try to deploy to it from a different account -- should fail.
  testUtils.logout(sandbox);
  testUtils.login(sandbox, 'testtest', 'testtest');
  run = sandbox.run('deploy', appName);
  run.waitSecs(commandTimeoutSecs);
  run.matchErr('belongs to a different user');
  run.expectExit(1);

  testUtils.logout(sandbox);
  testUtils.login(sandbox, 'test', 'testtest');

  // Delete our deployed app.
  testUtils.cleanUpApp(sandbox, appName);
  testUtils.logout(sandbox);
});


selftest.define('deploy - logged out', ['net', 'slow'], function () {
  var s = new Sandbox;
  var sandboxWithWarehouse;
  if (files.inCheckout()) {
    sandboxWithWarehouse = new Sandbox({
      warehouse: { v1: { tools: 'tool1', latest: true } }
    });
  } else {
    sandboxWithWarehouse = new Sandbox;
  }

  testUtils.login(s, 'test', 'testtest');
  var appName = testUtils.createAndDeployApp(s);
  testUtils.logout(s);

  // Deploy when logged out. We should be prompted to log in and then
  // the deploy should succeed.
  var run = s.run('deploy', appName);
  run.waitSecs(commandTimeoutSecs);
  run.matchErr('Email:');
  run.write('test@test.com\n');
  run.waitSecs(commandTimeoutSecs);
  run.matchErr('Password:');
  run.write('testtest\n');
  run.waitSecs(90);
  run.match('Now serving at ' + appName + '.meteor.com');
  run.expectExit(0);
  testUtils.cleanUpApp(s, appName);

  testUtils.logout(s);

  // Any deploy command for a legacy app that isn't password-protected
  // should prompt us to log in, and then should work.
  var legacyNoPassword = testUtils.createAndDeployLegacyApp(
    sandboxWithWarehouse
  );
  run = s.run('deploy', legacyNoPassword);
  run.waitSecs(commandTimeoutSecs);
  run.matchErr('Email:');
  run.write('test@test.com\n');
  run.waitSecs(commandTimeoutSecs);
  run.matchErr('Password: ');
  run.write('testtest\n');
  run.waitSecs(90);
  run.match('Now serving');
  run.expectExit(0);

  // Deploying to a legacy app that is password-protected should prompt
  // us to log in, and then tell us about 'meteor claim'.
  testUtils.logout(s);
  var legacyPassword = testUtils.createAndDeployLegacyApp(
    sandboxWithWarehouse,
    'test'
  );
  run = s.run('deploy', legacyPassword);
  run.waitSecs(commandTimeoutSecs);
  run.matchErr('Email:');
  // Log in with a username here to test that the email prompt also
  // accepts emails. (We put an email in the email prompt above.)
  run.write('test\n');
  run.waitSecs(commandTimeoutSecs);
  run.matchErr('Password:');
  run.write('testtest\n');
  run.waitSecs(commandTimeoutSecs);
  run.matchErr('meteor claim');
  run.expectExit(1);

  testUtils.cleanUpLegacyApp(sandboxWithWarehouse, legacyPassword, 'test');
  testUtils.logout(s);

  // Deploying to a new app using a user that exists but has no password
  // set should prompt us to set a password.
  // First, create a user without a password.
  appName = testUtils.randomAppName();
  var email = testUtils.randomUserEmail();
  run = s.run('deploy', appName);
  run.waitSecs(commandTimeoutSecs);
  run.matchErr('Email:');
  run.write(email + '\n');
  run.waitSecs(90);
  run.match('Now serving');
  run.waitSecs(commandTimeoutSecs);
  run.expectExit(0);
  // Now that we've created an account with this email address, we
  // should be logged in as it and should be able to delete it.
  testUtils.cleanUpApp(s, appName);
  testUtils.logout(s);
  // Now that we've created a user, try to deploy a new app.
  appName = testUtils.randomAppName();
  run = s.run('deploy', appName);
  run.waitSecs(commandTimeoutSecs);
  run.matchErr('Email:');
  run.write(email + '\n');
  run.waitSecs(commandTimeoutSecs);
  run.matchErr('pick a password');
  run.matchErr('An email has been sent to you with the link');
  run.stop();
});
