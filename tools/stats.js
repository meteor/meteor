var config = require("./config.js");
var uniload = require("./uniload.js");
var Fiber = require("fibers");
var project = require("./project.js");
var _ = require("underscore");

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
    var DDP = uniload.load({
      packages: ["livedata"]
    }).livedata.DDP;
    var conn = DDP.connect(config.getPackageStatsServerUrl());

    // XXX do the right thing in the following cases:
    // not logged in to meteor account
    // logged in to meteor accounts, but not logged into package stats server
    // logged into package stats server

    conn.call("recordAppPackages",
              project.getAppIdentifier(appDir),
              packageList(appDir));
  }).run();
};

exports.recordPackages = recordPackages;
exports.packageList = packageList; // for use in the "stats" self-test.
