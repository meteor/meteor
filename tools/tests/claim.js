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
});
