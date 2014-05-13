var Fiber = require("fibers");
var _ = require("underscore");

var config = require("./config.js");
var uniload = require("./uniload.js");
var project = require("./project.js");
var auth = require("./auth.js");
var ServiceConnection = require("./service-connection.js");

// Return a list of packages used by this app, both directly and
// indirectly. Formatted as a list of objects with 'name', 'version'
// and 'direct', which is how the `recordAppPackages` method on the
// stats server expects to get this list.
var packageList = function (appDir) {
  var directDeps = project.getPackages(appDir);

  return _.map(
    project.getIndirectDependencies(appDir),
    function (version, name) {
      return {
        name: name,
        version: version,
        direct: _.contains(directDeps, name)
      };
    }
  );
};

var recordPackages = function (appDir) {
  // We do this inside a new fiber to avoid blocking anything on talking
  // to the package stats server. If we can't connect, for example, we
  // don't care; we'll just miss out on recording these packages.
  Fiber(function () {
    var conn = connectToPackagesStatsServer();

    if (auth.isLoggedIn()) {
      auth.loginWithTokenOrOAuth(
        conn,
        config.getPackageStatsServerUrl(),
        config.getPackageStatsServerDomain(),
        "package-stats-server"
      );
    }

    conn.call("recordAppPackages",
              project.getAppIdentifier(appDir),
              packageList(appDir));
  }).run();
};

// Used in a test (and can only be used against the testing packages
// server) to fetch one package stats entry for a given application.
var getPackagesForAppIdInTest = function (appDir) {
  return connectToPackagesStatsServer().call(
    "getPackagesForAppId",
    project.getAppIdentifier(appDir));
};

var connectToPackagesStatsServer = function () {
  var Package = uniload.load({
    packages: ["livedata"]
  });
  var conn = new ServiceConnection(
    Package,
    config.getPackageStatsServerUrl()
  );
  return conn;
};

exports.recordPackages = recordPackages;
exports.packageList = packageList; // for use in the "stats" self-test.
exports.getPackagesForAppIdInTest = getPackagesForAppIdInTest;
