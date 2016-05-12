var _ = require('underscore');
var selftest = require('../tool-testing/selftest.js');
var Run = selftest.Run;
var testUtils = require('../tool-testing/test-utils.js');
var files = require('../fs/files.js');
var utils = require('../utils/utils.js');
var authClient = require('../meteor-services/auth-client.js');
var auth = require('../meteor-services/auth.js');

// Run curl with the given specifications. Return an instance of Run.
var runCurl = function (/*args*/) {
  var curl = "/usr/bin/curl";
  return new Run(curl, {
    args: _.toArray(arguments)
  });
};

// Some constants.
var GALAXY_USERNAME = process.env.GALAXY_USERNAME;
var GALAXY_PASSWORD = process.env.GALAXY_PASSWORD;
var GALAXY_URL = process.env.DEPLOY_HOSTNAME;
var GALAXY_MOCK_MODE = process.env.GALAXY_MOCK_MODE;

// Fail if the test is obviously not set up for using Galaxy.
//
// Make sure that we have at least set all of the variables that we need to run
// against a Galaxy (GALAXY_URL, username & password). An extra safety
// check to avoid strange errors, deploying/calling random methods on Mother,
// etc.
exports.sanityCheck = selftest.markStack(function () {
  if (! GALAXY_URL ) {
    selftest.fail("Please specify a GALAXY_URL to test against Galaxy.\n");
  }
  if (! GALAXY_USERNAME ||
      ! GALAXY_PASSWORD) {
    selftest.fail(
      "Can't use test account with Galaxy. " +
       "Please specify GALAXY_USERNAME and GALAXY_PASSWORD.\n");
  }
  if (! process.env.APP_MONGO) {
    selftest.fail(
      "Please provide an APP_MONGO url to use for deployed apps.\n");
   }
});

// Login to Galaxy with environment-variable credentials passed in by the user.
//
// Unlike the normal `meteor deploy` Galaxy is not yet publically available, so
// we don't want to use the publically-accessible test account here.
exports.loginToGalaxy = selftest.markStack(function (sandbox) {
  var user = GALAXY_USERNAME;
  var pass = GALAXY_PASSWORD;
  testUtils.login(sandbox, user, pass);
});

// Curl an app running on Galaxy. Automatically follow redirects.
//
// Dealing with DNS on Galaxy can be complicated. The standard way to ensure
// that we hit the right app on the right Galaxy is to curl the galaxy origin,
// with the host header set to our query app.
exports.curlToGalaxy = selftest.markStack(function (url) {
  var hostHeader = "host: " + url;
  var galaxyOrigin = GALAXY_URL;
  return runCurl("-vLH", hostHeader, galaxyOrigin);
});

// String we expect to hit on 200 OK.
exports.httpOK = "HTTP/1.1 200 OK";

// String we expect to hit when using SSL.
exports.httpRedirect = "HTTP/1.1 307 Temporary Redirect";

// We expect containers to take some time to startup.
//
// In the future, we can use this function to poll whether the containers have
// started and maybe our tests will be faster.
exports.waitForContainers = selftest.markStack(function () {
  // We are not spinning up any containers in mock mode, so don't wait too long.
  var waitTime = GALAXY_MOCK_MODE ? 1000 : 1000 * 10 * utils.timeoutScaleFactor;
  utils.sleepMs(waitTime);
});

// Deploy an app against a Galaxy
//
// When we deploy to Galaxy, we need to specify a Mongo URL and wait a little
// longer for the app to spin up.
//
// Options:
//   - settings: app settings, NOT including mandatory galaxy settings
//     such as MONGO_URL
//   - appName: app name to use; will be generated randomly if not
//     provided
//   - templateApp: the name of the template app to use. defaults to
//    'simple-app'
//   - useOldSettings: don't make a new settings object this app! This is a
//     redeploy, so reuse the settings that Galaxy has saved.
//
exports.createAndDeployApp =  selftest.markStack(function (sandbox, options) {
  options = options || {};
  var settings = options.settings;
  var appName = options.appName || testUtils.randomAppName();

  // The simple app contains standart app packages and some small bits of code
  // so that we can check that it is being served correctly. Let's use that as
  // our default.
  var templateApp = options.templateApp || 'simple-app';

  // Create the new galaxy settings.
  var galaxySettings = {
    "galaxy.meteor.com" : {
      env: {
        // XXX: Right now, all the galaxy test apps use the same mongo. This is
        // actually kind of super awkward... but generating and destroying new DBs
        // seems like it is introducing a bit too much complexity at this stage.
        "MONGO_URL": process.env.APP_MONGO
      }
    }
  };

  var fullAppName;
  if (! options.useOldSettings) {
    // Add all the settings together and write them out. Let user settings
    // override ours.
    var allSettings = _.extend(galaxySettings, settings);
    var settingsFile = "settings-" + appName + ".json";
    sandbox.write(settingsFile, JSON.stringify(allSettings));

    fullAppName = testUtils.createAndDeployApp(sandbox, {
      settingsFile: "../" + settingsFile,
      appName: appName,
      templateApp: templateApp
    });
  } else {
    fullAppName = testUtils.createAndDeployApp(sandbox, {
      appName: appName,
      templateApp: templateApp
    });
  }

  // Galaxy might take a while to spin up an app.
  exports.waitForContainers();

  return fullAppName;

});

// Cleanup the app by deleting it from Galaxy.
//
// XXX: We should also clean out its Mongo, but we don't, since, currently, none
// of our apps actually put any records into it.
exports.cleanUpApp = selftest.markStack(function (sandbox, appName) {
  testUtils.cleanUpApp(sandbox, appName);

  // Galaxy might take a while to spin up an app, though it should be fairly
  // quick.
  exports.waitForContainers();
});

//////////////////////////////////////////////////////////////////////////////
//  We want to test some of the server-side functionality that doesn't actually
//  have a command-line API right now. Below functionas are going to use the
//  tool's ability to make a DDP client and connect to the server to call
//  methods directly.
////////////////////////////////////////////////////////////////////////////////

// Returns a logged in connection to GalaxyAPI
exports.loggedInGalaxyAPIConnection = selftest.markStack(function () {
  // The credentials of the user might not be the credentials of the galaxytester.
  auth.doInteractivePasswordLogin({
    username: GALAXY_USERNAME,
    password: GALAXY_PASSWORD
  });
  var galaxyDomain = GALAXY_URL;
  var galaxyUrl = (GALAXY_MOCK_MODE ? "http://" : "https://") + galaxyDomain;
  return authClient.loggedInConnection(
    galaxyUrl,
    galaxyDomain,
    "galaxy-api"
  );
});

// If the connection has disconnected, close it and open a new one. (workaround
// for the fact that connections in the tool do not reconnect)
exports.renewConnection = selftest.markStack(function (conn) {
  if (!conn.connected) {
    conn.close();
    conn = exports.loggedInGalaxyAPIConnection();
  }
  return conn;
});

// Given a connection, makes a call to Galaxy API.
exports.callGalaxyAPI = function (conn, ...args) {
  conn = exports.renewConnection(conn);
  return conn.call(...args);
};

// Gets app record from Galaxy API by name.
//
// This method will create and manage its own connection.
exports.getAppRecordByName = selftest.markStack(function (appName) {
  var conn = exports.loggedInGalaxyAPIConnection();
  var appRecord = {};
  conn.connection.registerStore('app', {
    update: function (msg) {
      if (msg.msg === 'added' && msg.fields &&
          msg.fields.hostname === appName) {
        appRecord = _.extend({ _id: msg.id }, msg.fields);
      }
    }
  });
  conn.subscribeAndWait("/app", appName);
  // If we can't find the app, fail the test right now.
  if (_.isEmpty(appRecord)) {
    selftest.fail("Cannot find app: ", appName);
  }
  conn.close();
  return appRecord;
});


// Get container statuses for the given app ID.
//
// This method will create and manage its own connection.
exports.getAppContainerStatuses = selftest.markStack(function (appId, appName) {
  var conn = exports.loggedInGalaxyAPIConnection();

  var containers = [];
  var statuses = "/app/containerStatuses";
  conn.connection.registerStore(statuses, {
    update: function (msg) {
      if (msg.msg === 'added' && msg.fields &&
          msg.fields.appId === appId) {
        containers.push(_.extend({ _id: msg.id }, msg.fields));
      }
    }
  });
  conn.subscribeAndWait(statuses, appName);
  conn.close();
  return containers;
});

// Close and logout.
exports.closeGalaxyConnection = selftest.markStack(function (conn) {
  auth.logoutCommand();
  conn.close();
});


// Ignore HTTP checks in mock mode
exports.ignoreHttpChecks = selftest.markStack(function () {
  return !! GALAXY_MOCK_MODE;
});
