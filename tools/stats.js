var config = require("./config.js");
var uniload = require("./uniload.js");
var Fiber = require("fibers");
var project = require("./project.js");
var _ = require("underscore");

var recordPackages = function (appDir) {
  // We do this inside a new fiber to avoid blocking anything on talking
  // to the package stats server. If we can't connect, for example, we
  // don't care; we'll just miss out on recording these packages.
  Fiber(function () {
    var DDP = uniload.load({
      packages: ["livedata"]
    }).livedata.DDP;
    var conn = DDP.connect(config.getPackageStatsServerUrl());

    // not logged in to meteor account
    // logged in to meteor accounts, but not logged into package stats server
    // logged into package stats server

    var appId = project.getAppIdentifier(appDir);
    var directDeps = project.getPackages(appDir);
    var packageList = _.map(
      project.getIndirectDependencies(appDir),
      function (version, name) {
        return {
          packageName: name,
          version: version,
          direct: _.contains(directDeps, name)
        };
      }
    );

    conn.call("recordAppPackages", appId, packageList);
  }).run();
};

exports.recordPackages = recordPackages;
