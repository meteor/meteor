// Utilities for testing against Galaxy.
var _ = require('underscore');
var process = require('process');
var selftest = require('../tool-testing/selftest.js');
var Run = selftest.Run;
var testUtils = require('../tool-testing/test-utils.js');
var files = require('../fs/files.js');
var utils = require('../utils/utils.js');

// Run curl with the given specifications. Return an instance of Run.
var runCurl = function (/*args*/) {
  var curl = "/usr/bin/curl";
  return new Run(curl, {
    args: _.toArray(arguments)
  });
};

// Fail if the test is obviously not set up for using Galaxy.
//
// Make sure that we have at least set all of the variables that we need to run
// against a Galaxy (DEPLOY_HOSTNAME, username & password). An extra safety
// check to avoid strange errors, deploying/calling random methods on Mother,
// etc.
exports.sanityCheck = function () {
  if (! process.env.DEPLOY_HOSTNAME ) {
    selftest.fail("Please specify a DEPLOY_HOSTNAME to test against Galaxy.\n");
  }
  if (! process.env.GALAXY_USERNAME ||
      ! process.env.GALAXY_PASSWORD) {
    selftest.fail(
      "Can't use test account with Galaxy. " +
       "Please specify GALAXY_USERNAME and GALAXY_PASSWORD.\n");
  }
  if (! process.env.APP_MONGO) {
    selftest.fail(
      "Please provide an APP_MONGO url to use for deployed apps.\n");
   }
};

// Login to Galaxy with environment-variable credentials passed in by the user.
//
// Unlike the normal `meteor deploy` Galaxy is not yet publically available, so
// we don't want to use the publically-accessible test account here.
exports.loginToGalaxy = function (sandbox) {
  var user = process.env.GALAXY_USERNAME;
  var pass = process.env.GALAXY_PASSWORD;
  testUtils.login(sandbox, user, pass);
};

// Curl an app running on Galaxy. Automatically follow redirects.
//
// Dealing with DNS on Galaxy can be complicated. The standard way to ensure
// that we hit the right app on the right Galaxy is to curl the galaxy origin,
// with the host header set to our query app.
exports.curlToGalaxy = function (url) {
  var hostHeader = "host: " + url;
  var galaxyOrigin = process.env.DEPLOY_HOSTNAME;
  return runCurl("-vLH", hostHeader, galaxyOrigin);
};

// String we expect to hit on 200 OK.
exports.httpOK = "HTTP/1.1 200 OK";

// String we expect to hit when using SSL.
exports.httpRedirect = "HTTP/1.1 307 Temporary Redirect";

// Deploy an app against a Galaxy
//
// When we deploy to Galaxy, we need to specify a Mongo URL and wait a little
// longer for the app to spin up.
exports.createAndDeployApp =  function (sandbox, settings, deployOpts) {
  settings = settings || {};
  deployOpts = deployOpts || {};

  // Generate an app name manually. We need this for Galaxy settings.
  var appName = testUtils.randomAppName();

  // Create the new galaxy settings.
  var galaxySettings = {};
  galaxySettings[appName] = {
    env: {
      "MONGO_URL": process.env.APP_MONGO
    }
  };

  // Add all the settings together and write them out.
  var allSettings = _.extend(galaxySettings, settings);
  var settingsFile = "settings-" + appName + ".json";
  sandbox.write(settingsFile, JSON.stringify(allSettings));

  // Add the settings & app name to deploy options
  var galaxyDeploySettings = _.extend({
    settingsFile: "../" + settingsFile,
    appName: appName,
    // The simple app contains standart app packages and some small bits of code
    // so that we can check that it is being served correctly.
    templateApp: 'simple-app'
  }, deployOpts);

  testUtils.createAndDeployApp(sandbox, galaxyDeploySettings);

  // Galaxy might take a while to spin up an app.
  utils.sleepMs(9000);

  return appName + "." + process.env.DEPLOY_HOSTNAME;

};
