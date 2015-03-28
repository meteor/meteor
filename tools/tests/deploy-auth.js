var _ = require('underscore');
var selftest = require('../selftest.js');
var testUtils = require('../test-utils.js');
var files = require('../files.js');
var Sandbox = selftest.Sandbox;
var httpHelpers = require('../http-helpers.js');
var config = require("../config.js");

var commandTimeoutSecs = testUtils.accountsCommandTimeoutSecs;

selftest.define('deploy - expired credentials', ['net', 'slow'], function () {
  var s = new Sandbox;
  // Create an account and then expire the login token before setting a
  // username. On the next deploy, we should get an email prompt
  // followed by a registration email, not a username prompt.
  var email = testUtils.randomUserEmail();
  var appName = testUtils.randomAppName() + "." +
        config.getDeployHostname();
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
  appName = testUtils.randomAppName() + "." +
    config.getDeployHostname();
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
  run = s.run('deploy', testUtils.randomAppName() + "." +
              config.getDeployHostname());
  run.matchErr('not in a Meteor project directory');
  run.expectExit(1);
});

selftest.define('deploy - logged in', ['net', 'slow'], function () {
  var sandbox = new Sandbox;
  sandbox.createApp('deployapp', 'empty');
  sandbox.cd('deployapp');

  testUtils.login(sandbox, 'test', 'testtest');

  // NON-LEGACY APPS

  // Deploy an app.
  var appName = testUtils.createAndDeployApp(sandbox);

  // Try to deploy to it from a different account -- should fail.
  testUtils.logout(sandbox);
  testUtils.login(sandbox, 'testtest', 'testtest');
  var run = sandbox.run('deploy', appName);
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
  run.match('Now serving at http://' + appName);
  run.expectExit(0);
  testUtils.cleanUpApp(s, appName);

  testUtils.logout(s);

  // Deploying to a new app using a user that exists but has no password
  // set should prompt us to set a password.
  // First, create a user without a password.
  appName = testUtils.randomAppName() + "." + config.getDeployHostname();
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
  appName = testUtils.randomAppName() + "." + config.getDeployHostname();
  run = s.run('deploy', appName);
  run.waitSecs(commandTimeoutSecs);
  run.matchErr('Email:');
  run.write(email + '\n');
  run.waitSecs(commandTimeoutSecs);
  run.matchErr('pick a password');
  run.matchErr('sent to you with the link');
  run.stop();
});
