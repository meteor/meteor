var _ = require('underscore');
var selftest = require('../selftest.js');
var testUtils = require('../test-utils.js');
var files = require('../files.js');
var Sandbox = selftest.Sandbox;
var httpHelpers = require('../http-helpers.js');
var utils = require("../utils.js");

var commandTimeoutSecs = testUtils.accountsCommandTimeoutSecs;

selftest.define('list-sites - basic', ['net', 'slow'], function () {
  var s = new Sandbox;
  var email = testUtils.randomUserEmail();
  var appName1 = testUtils.randomAppName() + "." +
        (process.env.DEPLOY_HOSTNAME || "meteor.com");
  var appName2 = testUtils.randomAppName() + "." +
        (process.env.DEPLOY_HOSTNAME || "meteor.com");
  testUtils.deployWithNewEmail(s, email, appName1);
  testUtils.createAndDeployApp(s, { appName: appName2.split(".")[0] });
  var run = s.run('list-sites');
  run.waitSecs(commandTimeoutSecs);
  run.read(appName1 + '\n' + appName2);
  testUtils.cleanUpApp(s, appName1);
  testUtils.cleanUpApp(s, appName2);
  testUtils.logout(s);
});
