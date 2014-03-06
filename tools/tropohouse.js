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

tropohouse.calculatePath= function(packageName, version, archString) {
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
