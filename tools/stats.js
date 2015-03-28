var Fiber = require("fibers");
var _ = require("underscore");

var config = require("./config.js");
var files = require("./files.js");
var auth = require("./auth.js");
var ServiceConnection = require("./service-connection.js");
var httpHelpers = require("./http-helpers.js");
var Console = require("./console.js").Console;

// The name of the package that you add to your app to opt out of
// sending stats.
var OPT_OUT_PACKAGE_NAME = "package-stats-opt-out";

// Return a list of packages used by this app, both directly and
// indirectly. Formatted as a list of objects with 'name', 'version'
// and 'direct', which is how the `recordAppPackages` method on the
// stats server expects to get this list.
var packageList = function (projectContext) {
  var versions = [];
  projectContext.packageMap.eachPackage(function (name, info) {
    versions.push({
      name: name,
      version: info.version,
      local: info.kind === 'local',
      direct: !! projectContext.projectConstraintsFile.getConstraint(name)
    });
  });
  return versions;
};

// Options:
// - what: one of "sdk.bundle", "sdk.deploy", "sdk.run".
// - projectContext: the ProjectContext. prepareProjectForBuild
//   must have run successfully. We must extract all necessary data
//   from this before yielding.
// - site: If it's a deploy, the name of the site ("foo.meteor.com") that we're
//   deploying to.
var recordPackages = function (options) {
  // Before doing anything, look at the app's dependencies to see if the
  // opt-out package is there; if present, we don't record any stats.
  var packages = packageList(options.projectContext);
  if (_.findWhere(packages, { name: OPT_OUT_PACKAGE_NAME })) {
    // Print some output for the 'report-stats' self-test.
    if (process.env.METEOR_PACKAGE_STATS_TEST_OUTPUT) {
      process.stdout.write("PACKAGE STATS NOT SENT\n");
    }
    return;
  }

  var appIdentifier = options.projectContext.appIdentifier;

  // We do this inside a new fiber to avoid blocking anything on talking
  // to the package stats server. If we can't connect, for example, we
  // don't care; we'll just miss out on recording these packages.
  // This also gives it its own buildmessage state.
  // However, we do make sure to have already extracted the package list from
  // projectContext, since it might mutate out from under us otherwise.
  Fiber(function () {

    var details = {
      what: options.what,
      userAgent: httpHelpers.getUserAgent(),
      sessionId: auth.getSessionId(config.getAccountsDomain()),
      site: options.site
    };

    try {
      var conn = connectToPackagesStatsServer();
      var accountsConfiguration = auth.getAccountsConfiguration(conn);

      if (auth.isLoggedIn()) {
        try {
          auth.loginWithTokenOrOAuth(
            conn,
            accountsConfiguration,
            config.getPackageStatsServerUrl(),
            config.getPackageStatsServerDomain(),
            "package-stats-server"
          );
        } catch (err) {
          // Do nothing. If we can't log in, we should continue and report
          // stats anonymously.
          //
          // We log other errors with `logErrorIfInCheckout`, but login
          // errors can happen in normal operation when nothing is wrong
          // (e.g. login token expired or revoked) so we don't log them.
        }
      }

      var result = conn.call("recordAppPackages",
                             appIdentifier,
                             packages,
                             details);

      // If the stats server sent us a new session, save it for use on
      // subsequent requests.
      if (result && result.newSessionId) {
        auth.setSessionId(config.getAccountsDomain(), result.newSessionId);
      }

      if (process.env.METEOR_PACKAGE_STATS_TEST_OUTPUT) {
        // Print some output for the 'report-stats' self-test.
        process.stdout.write("PACKAGE STATS SENT\n");
      }
    } catch (err) {
      logErrorIfInCheckout(err);
      // Do nothing. A failure to record package stats shouldn't be
      // visible to the end user and shouldn't affect whatever command
      // they are running.
    } finally {
      conn && conn.close();
    }
  }).run();
};

var logErrorIfInCheckout = function (err) {
  if (files.inCheckout() || process.env.METEOR_PACKAGE_STATS_TEST_OUTPUT) {
    Console.warn("Failed to record package usage.");
    Console.warn(
      "(This error is hidden when you are not running Meteor from a",
      "checkout.)");
    var printErr = err.stack || err;
    Console.rawWarn(printErr + "\n");
    Console.warn();
    Console.warn();
  }
};

// Used in a test (and can only be used against the testing packages
// server) to fetch one package stats entry for a given application.
var getPackagesForAppIdInTest = function (projectContext) {
  var conn = connectToPackagesStatsServer();
  var result;
  try {
    result = conn.call(
      "getPackagesForAppId",
      projectContext.appIdentifier);
    if (result && result.details) {
      result.details.packages = _.sortBy(result.details.packages, "name");
    }
  } finally {
    conn.close();
  }

  return result;
};

var connectToPackagesStatsServer = function () {
  return new ServiceConnection(
    config.getPackageStatsServerUrl(),
    {_dontPrintErrors: true}
  );
};

exports.recordPackages = recordPackages;
exports.packageList = packageList; // for use in the "stats" self-test.
exports.getPackagesForAppIdInTest = getPackagesForAppIdInTest;
