var Fiber = require("fibers");
var _ = require("underscore");
var os = require("os");

var config = require("./config.js");
var files = require("./files.js");
var uniload = require("./uniload.js");
var project = require("./project.js");
var auth = require("./auth.js");
var ServiceConnection = require("./service-connection.js");
var release = require("./release.js");
var buildmessage = require("./buildmessage.js");
var httpHelpers = require("./http-helpers.js");
var Console = require("./console.js").Console;

// The name of the package that you add to your app to opt out of
// sending stats.
var optOutPackageName = "package-stats-opt-out";

// Return a list of packages used by this app, both directly and
// indirectly. Formatted as a list of objects with 'name', 'version'
// and 'direct', which is how the `recordAppPackages` method on the
// stats server expects to get this list.
//
// In tests, we want to use the same logic to calculate the list of
// packages for an app created in a sandbox, but we don't want to run
// the constraint solver, try to load local packages from the catalog,
// etc. In particular, we don't want to have to repoint project.project
// at whatever random app we just created in a sandbox and re-initialize
// the catalog with its local packages (and then have to undo all that
// after the test is over). So tests can pass a project.Project as an
// argument, and we'll calculate the list of packages just by looking at
// .meteor/packages and .meteor/versions, not by doing anything fancy
// like running the constraint solver.
// NOTE: This means that if you pass `_currentProjectForTest`, we assume
// that it is pointing to a root directory with an existing
// .meteor/versions file.
var packageList = function (_currentProjectForTest) {
  var directDeps = (_currentProjectForTest || project.project).getConstraints();

  var versions = (_currentProjectForTest || project.project).getVersions({
    dontRunConstraintSolver: true
  });

  return _.map(
    versions,
    function (version, name) {
      return {
        name: name,
        version: version,
        direct: _.has(directDeps, name)
      };
    }
  );
};

// 'what' should be one of "sdk.bundle", "sdk.deploy", "sdk.run".
// If it's a deploy, 'site' should be the name of the site
// ("foo.meteor.com") that we're deploying to.
var recordPackages = function (what, site) {
  // Before doing anything, look at the app's dependencies to see if the
  // opt-out package is there; if present, we don't record any stats.
  var packages = packageList();
  if (_.contains(_.pluck(packages, "name"), optOutPackageName)) {
    // Print some output for the 'report-stats' self-test.
    if (process.env.METEOR_PACKAGE_STATS_TEST_OUTPUT) {
      process.stdout.write("PACKAGE STATS NOT SENT\n");
    }
    return;
  }

  // We do this inside a new fiber to avoid blocking anything on talking
  // to the package stats server. If we can't connect, for example, we
  // don't care; we'll just miss out on recording these packages.
  // This also gives it its own buildmessage state.
  Fiber(function () {

    var details = {
      what: what,
      userAgent: httpHelpers.getUserAgent(),
      sessionId: auth.getSessionId(config.getAccountsDomain()),
      site: site
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
                             project.project.getAppIdentifier(),
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
  if (files.inCheckout()) {
    Console.stderr.write("Failed to record package usage.\n");
    Console.stderr.write(
      "(This error is hidden when you are not running Meteor from a checkout.)\n");
    Console.stderr.write(err.stack || err);
    Console.stderr.write("\n\n");
  }
};

// Used in a test (and can only be used against the testing packages
// server) to fetch one package stats entry for a given application.
var getPackagesForAppIdInTest = function (currentProject) {
  var conn = connectToPackagesStatsServer();
  var result;
  try {
    result = conn.call(
      "getPackagesForAppId",
      currentProject.getAppIdentifier());
    if (result && result.details) {
      result.details.packages = _.sortBy(result.details.packages, "name");
    }
  } finally {
    conn.close();
  }

  return result;
};

var connectToPackagesStatsServer = function () {
  var Package = uniload.load({
    packages: ["meteor", "ddp"]
  });
  var conn = new ServiceConnection(
    Package,
    config.getPackageStatsServerUrl(),
    {_dontPrintErrors: true}
  );
  return conn;
};

exports.recordPackages = recordPackages;
exports.packageList = packageList; // for use in the "stats" self-test.
exports.getPackagesForAppIdInTest = getPackagesForAppIdInTest;
