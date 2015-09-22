var _ = require('underscore');
var selftest = require('../tool-testing/selftest.js');
var testUtils = require('../tool-testing/test-utils.js');
var files = require('../fs/files.js');
var config = require('../meteor-services/config.js');
var Sandbox = selftest.Sandbox;

var commandTimeoutSecs = testUtils.accountsCommandTimeoutSecs;

selftest.define('list-sites - basic', ['net', 'slow'], function () {
  var s = new Sandbox;
  var email = testUtils.randomUserEmail();
  var appName1 = testUtils.randomAppName() + "." + config.getDeployHostname();
  var appName2 = testUtils.randomAppName() + "." + config.getDeployHostname();
  testUtils.deployWithNewEmail(s, email, appName1);
  testUtils.createAndDeployApp(s, { appName: appName2 });
  var sortedApps = [appName1, appName2];
  sortedApps.sort();

  var run = s.run('list-sites');
  run.waitSecs(commandTimeoutSecs);
  _.each(sortedApps, function (app) {
    run.read(app + '\n');
  });
  run.expectEnd();
  run.expectExit(0);
  testUtils.cleanUpApp(s, appName1);
  testUtils.cleanUpApp(s, appName2);
  testUtils.logout(s);
});
