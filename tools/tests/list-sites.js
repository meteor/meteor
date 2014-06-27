var _ = require('underscore');
var selftest = require('../selftest.js');
var testUtils = require('../test-utils.js');
var files = require('../files.js');
var Sandbox = selftest.Sandbox;

var commandTimeoutSecs = testUtils.accountsCommandTimeoutSecs;

selftest.define('list-sites - basic', ['net', 'slow'], function () {
  var s = new Sandbox;
  var email = testUtils.randomUserEmail();
  var appName1 = testUtils.randomAppName();
  var appName2 = testUtils.randomAppName();
  testUtils.deployWithNewEmail(s, email, appName1);
  testUtils.createAndDeployApp(s, { appName: appName2 });
  var run = s.run('list-sites');
  run.waitSecs(commandTimeoutSecs);
  run.read(appName1 + '.meteor.com' + '\n' + appName2 + '.meteor.com');
  testUtils.cleanUpApp(s, appName1);
  testUtils.cleanUpApp(s, appName2);
  testUtils.logout(s);
});
