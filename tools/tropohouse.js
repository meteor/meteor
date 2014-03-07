var path = require("path");
var fs = require("fs");
var os = require("os");
var Future = require("fibers/future");
var _ = require("underscore");

var files = require('./files.js');
var utils = require('./utils.js');
var updater = require('./updater.js');
var httpHelpers = require('./http-helpers.js');
var fiberHelpers = require('./fiber-helpers.js');
var release = require('./release.js');

var tropohouse = exports;

// Return our loaded collection of tools, releases and
// packages. If we're running an installed version, found at
// $HOME/.meteor.
tropohouse.getWarehouseDir = function () {
  // a hook for tests, or i guess for users.
  if (process.env.METEOR_WAREHOUSE_DIR)
    return process.env.METEOR_WAREHOUSE_DIR;

  var warehouseBase = files.inCheckout()
     ? files.getCurrentToolsDir() : process.env.HOME;
  return path.join(warehouseBase, ".meteor");
};

tropohouse.calculatePath = function(packageName, version, archString) {
  var uniquePath = path.join(packageName, version, archString);
  var fullPath = path.join(tropohouse.getWarehouseDir(), "packages", uniquePath);
  return fullPath;
};

tropohouse.hasSpecifiedBuild = function(packageName, version, archString) {
  return fs.existsSync(tropohouse.calculatePath(packageName, version, archString));
};

tropohouse.downloadSpecifiedBuild = function(packageName, version, buildRecord) {
  var path = tropohouse.calculatePath(packageName, version, buildRecord.architecture);
  var packageTarball = httpHelpers.getUrl({
      url: buildRecord.build.url,
      encoding: null
  });
  files.extractTarGz(packageTarball, path);

  // Make symlinks.
  // XXX: if there is a plus in archstring, split and for each one that does not exist, split into symlink.
  // XXX: make atomic.
};

// Returns true if we now have the package.
// XXX more precise error handling in offline case. maybe throw instead like
// warehouse does.
tropohouse.maybeDownloadPackageForArchitectures = function (versionInfo,
                                                            architectures) {
  var cat = release.current.catalog;

  // If this package isn't coming from the package server (loaded from
  // a checkout, or from an app package directory), don't try to
  // download it (we already have it)
  if (cat.isLocalPackage(versionInfo.packageName))
    return true;

  // XXX rather than getAnyBuild, should specifically look to see if
  // we have builds that match architectures
  var buildInfo = cat.getAnyBuild(versionInfo.packageName, versionInfo.version);
  if (! buildInfo) {
    return false;
  }

  // If the tarball is not in the warehouse, download it there.
  if (tropohouse.hasSpecifiedBuild(versionInfo.packageName,versionInfo.version,
                                   buildInfo.architecture)) {
    return true;
  }

  // XXX error handling
  tropohouse.downloadSpecifiedBuild(
    versionInfo.packageName, versionInfo.version, buildInfo);
  return true;
};
