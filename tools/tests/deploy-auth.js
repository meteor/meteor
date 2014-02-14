var _ = require('underscore');
var selftest = require('../selftest.js');
var utils = require('../test-utils.js');
var Sandbox = selftest.Sandbox;

// XXX need to make sure that mother doesn't clean up:
// 'legacy-password-app-for-selftest'
// 'legacy-no-password-app-for-selftest'
// 'app-for-selftest-not-test-owned'
// 'app-for-selftest-test-owned'

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

  _.each([sandbox], function (s) {
    s.createApp('deployapp', 'empty');
    s.cd('deployapp');
  });

  // LEGACY APPS

  // Deploy a legacy app with no password
  var noPasswordLegacyApp = utils.createAndDeployLegacyApp(sandboxWithWarehouse);

  utils.login(sandbox, 'test', 'testtest');

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
  run = sandbox.run('deploy', '-D', noPasswordLegacyApp);
  run.waitSecs(5);
  run.match('Deleted');
  run.expectExit(0);

  // Deploy a legacy password-protected app
  var passwordLegacyApp = utils.createAndDeployLegacyApp(sandboxWithWarehouse, 'test');
  // We shouldn't be able to deploy to this app without claiming it
  run = sandbox.run('deploy', passwordLegacyApp);
  run.waitSecs(5);
  run.matchErr('meteor claim');
  run.expectExit(1);
  // If we claim it, we should be able to deploy to it.
  run = sandbox.run('claim', passwordLegacyApp);
  run.waitSecs(5);
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
  run = sandbox.run('deploy', '-D', passwordLegacyApp);

  // NON-LEGACY APPS

  // Deploy an app.
  var appName = utils.randomAppName();
  run = sandbox.run('deploy', appName);
  run.waitSecs(90);
  run.match('Now serving at ' + appName + '.meteor.com');
  run.expectExit(0);

  // Try to deploy to it from a different account -- should fail.
  utils.logout(sandbox);
  utils.login(sandbox, 'testtest', 'testtest');
  run = sandbox.run('deploy', appName);
  run.waitSecs(5);
  run.matchErr('belongs to a different user');
  run.expectExit(1);

  utils.logout(sandbox);
  utils.login(sandbox, 'test', 'testtest');

  // Delete our deployed app.
  run = sandbox.run('deploy', '-D', appName);
  run.waitSecs(20);
  run.match('Deleted');
  run.expectExit(0);
});


selftest.define('deploy - logged out', ['net', 'slow'], function () {
  var s = new Sandbox;

  s.createApp('deployapp', 'empty');
  s.cd('deployapp');

  // Deploy when logged out. We should be prompted to log in and then
  // the deploy should succeed.
  var appName = utils.randomString(10);
  var run = s.run('deploy', appName);
  run.waitSecs(5);
  run.matchErr('Email:');
  // XXX We should be able to log in with username here too?
  run.write('test@test.com\n');
  run.waitSecs(5);
  run.matchErr('Password:');
  run.write('testtest\n');
  run.waitSecs(90);
  run.match('Now serving at ' + appName + '.meteor.com');
  run.expectExit(0);
  // Clean up our deployed app
  run = s.run('deploy', '-D', appName);
  run.waitSecs(20);
  run.match('Deleted');
  run.expectExit(0);

  utils.logout(s);

  // Deploying to legacy-no-password-app-for-selftest should prompt us
  // to login, and then just work.
  run = s.run('deploy', 'legacy-no-password-app-for-selftest');
  run.waitSecs(5);
  run.matchErr('Email:');
  run.write('test@test.com\n');
  run.matchErr('Password:');
  // Don't actually log in and deploy, because that will claim the app for us.
  // XXX Deploy a test legacy app with --release, and then deploy to that one.
  run.stop();

  // Deploying to legacy-password-app-for-selftest should prompt us to
  // login, and then tell us about 'meteor claim'.
  run = s.run('deploy', 'legacy-password-app-for-selftest');
  run.waitSecs(5);
  run.matchErr('Email:');
  // Log in with a username here to test that the email prompt also
  // accepts emails. (We put an email in the email prompt above.)
  run.write('test\n');
  run.matchErr('Password:');
  run.write('testtest\n');
  run.waitSecs(5);
  run.matchErr('meteor claim');
  run.expectExit(1);

  utils.logout(s);

  // Deploying a new app using a user that exists but has no password
  // set should prompt us to set a password.
  run = s.run('deploy', appName);
  run.waitSecs(5);
  run.matchErr('Email:');
  run.write('user.forselftest.without.password@meteor.com\n');
  run.waitSecs(5);
  run.matchErr('already in use');
  run.matchErr('pick a password');
  run.stop();
});
