var _ = require('underscore');
var selftest = require('../selftest.js');
var testUtils = require('../test-utils.js');
var Sandbox = selftest.Sandbox;

selftest.define('deploy - logged in', ['net', 'slow'], function () {
  // Create two sandboxes: one with a warehouse so that we can run
  // --release, and one without a warehouse so that we run from the
  // checkout or release that we started from.
  // XXX Is having two sandboxes the only way to do this?
  var sandboxWithWarehouse = new Sandbox({
    // Include a warehouse arugment so that we can deploy apps with
    // --release arguments.
    warehouse: {
      v1: { tools: 'tool1', latest: true }
    }
  });

  var sandbox = new Sandbox;
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
  run.waitSecs(20);
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
  run.waitSecs(15);
  run.matchErr('meteor claim');
  run.expectExit(1);
  // If we claim it, we should be able to deploy to it.
  run = sandbox.run('claim', passwordLegacyApp);
  run.waitSecs(15);
  run.matchErr('Password:');
  run.write('test\n');
  run.waitSecs(10);
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
  run.waitSecs(5);
  run.matchErr('belongs to a different user');
  run.expectExit(1);

  testUtils.logout(sandbox);
  testUtils.login(sandbox, 'test', 'testtest');

  // Delete our deployed app.
  testUtils.cleanUpApp(sandbox, appName);
});


selftest.define('deploy - logged out', ['net', 'slow'], function () {
  var s = new Sandbox;
  var sandboxWithWarehouse = new Sandbox({
    warehouse: { v1: { tools: 'tool1', latest: true } }
  });

  testUtils.login(s, 'test', 'testtest');
  var appName = testUtils.createAndDeployApp(s);
  testUtils.logout(s);

  // Deploy when logged out. We should be prompted to log in and then
  // the deploy should succeed.
  var run = s.run('deploy', appName);
  run.waitSecs(5);
  run.matchErr('Email:');
  run.write('test@test.com\n');
  run.waitSecs(5);
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
  run.waitSecs(15);
  run.matchErr('Email:');
  run.write('test@test.com\n');
  run.waitSecs(15);
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
  run.waitSecs(5);
  run.matchErr('Email:');
  // Log in with a username here to test that the email prompt also
  // accepts emails. (We put an email in the email prompt above.)
  run.write('test\n');
  run.waitSecs(5);
  run.matchErr('Password:');
  run.write('testtest\n');
  run.waitSecs(15);
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
  run.waitSecs(5);
  run.matchErr('Email:');
  run.write(email + '\n');
  run.waitSecs(90);
  run.match('Now serving');
  run.waitSecs(5);
  run.expectExit(0);
  // Now that we've created an account with this email address, we
  // should be logged in as it and should be able to delete it.
  testUtils.cleanUpApp(s, appName);
  testUtils.logout(s);
  // Now that we've created a user, try to deploy a new app.
  appName = testUtils.randomAppName();
  run = s.run('deploy', appName);
  run.waitSecs(5);
  run.matchErr('Email:');
  run.write(email + '\n');
  run.waitSecs(5);
  run.matchErr('already in use');
  run.matchErr('pick a password');
  run.stop();
});
