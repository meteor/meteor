var selftest = require('../selftest.js');
var utils = require('../test-utils.js');
var Sandbox = selftest.Sandbox;
var AUTHTIMEOUT = 5;

var loggedInError = function(run) {
  run.waitSecs(AUTHTIMEOUT);
  run.matchErr("You must be logged in to claim sites.");
  run.expectExit(1);
}

var waitAndError = function(run, errmsg) {
  run.waitSecs(AUTHTIMEOUT);
  console.log(errmsg);
  run.matchErr(errmsg);
  run.expectExit(1);
}

selftest.define("claim", ['net'], function () {
  var s = new Sandbox;

  // Can't claim sites while logged out.
  // Nonexistent site.
  var run = s.run('claim', utils.randomAppName(20));
  loggedInError(run);

  // Existing site.
  run = s.run('claim', 'mother-test');
  loggedInError(run);

  // Claim will not work on non-legacy sites.
  // belongs to me.
  utils.login(s, "test", "testtest");
  var appName = utils.createAndDeployApp(s);
  run = s.run('claim', appName);
  waitAndError(run, "That site already belongs to you.");

  // belongs to not me.
  utils.logout(s);
  utils.login(s, "testtest", "testtest");
  run = s.run('claim', appName);
  waitAndError(run, "Sorry, that site belongs to someone else.");

  // belongs to not me, but I am authorized.
  utils.logout(s);
  utils.login(s, "test", "testtest");
  run = s.run('authorized', appName, '--add', 'testtest');
  run.waitSecs(5);
  run.expectExit(0);
  utils.logout(s);
  utils.login(s, "testtest", "testtest");
  run = s.run('claim', appName);
  waitAndError(run, "That site already belongs to you");

  utils.cleanUpApp(s, appName);

  // Legacy sites.
  var sLegacy = new Sandbox({
    // Include a warehouse argument so that we can deploy apps with
    // --release arguments.
    warehouse: {
      v1: { tools: 'tool1', latest: true }
    }
  });

  // legacy w/pwd.
  var pwd = utils.randomString(10);
  var legacyApp = utils.createAndDeployLegacyApp(sLegacy, pwd);

  run = s.run('claim', legacyApp);
  run.waitSecs(5);
  run.matchErr('Password:');
  run.write('badpass\n');
  run.waitSecs(5);
  run.matchErr("Couldn't claim site:");
  run.expectExit(1);

  run = s.run('claim', legacyApp);
  run.waitSecs(5);
  run.matchErr('Password:');
  run.write(pwd+"\n");
  run.match("successfully transferred to your account");
  run.expectExit(0);

  utils.cleanUpApp(s, legacyApp);

  // legacy w/o pwd.
  legacyApp = utils.createAndDeployLegacyApp(sLegacy);

  run = s.run('claim', legacyApp);
  run.waitSecs(5);
  run.match("successfully transferred to your account");
  run.expectExit(0);

  // No site deployed.
  run = s.run('claim', utils.randomAppName(20));
  waitAndError(run, "There isn't a site deployed at that address.");

  utils.cleanUpApp(s, legacyApp);
});
