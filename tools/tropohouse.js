var path = require("path");
var fs = require("fs");
var os = require("os");
var Future = require("fibers/future");
var _ = require("underscore");

var files = require('./files.js');
var packages = require('./packages.js');
var utils = require('./utils.js');
var updater = require('./updater.js');
var httpHelpers = require('./http-helpers.js');
var fiberHelpers = require('./fiber-helpers.js');
var release = require('./release.js');
var archinfo = require('./archinfo.js');

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

tropohouse.downloadedBuildsDirectory = function(packageName, version) {
  return path.join(tropohouse.getWarehouseDir(), "downloaded-builds",
                   packageName, version);
};

tropohouse.downloadedBuildPath = function(packageName, version, buildArches) {
  return path.join(tropohouse.downloadedBuildsDirectory(packageName, version),
                   buildArches);
};

tropohouse.downloadedArches = function (packageName, version) {
  var downloadedBuilds = tropohouse.downloadedBuilds(packageName, version);
  var downloadedArches = {};
  _.each(downloadedBuilds, function (build) {
    _.each(build.split('+'), function (arch) {
      downloadedArches[arch] = true;
    });
  });
  return _.keys(downloadedArches);
};

tropohouse.downloadedBuilds = function (packageName, version) {
  return files.readdirNoDots(
    tropohouse.downloadedBuildsDirectory(packageName, version));
};

tropohouse.packagePath = function (packageName, version) {
  return path.join(tropohouse.getWarehouseDir(), "packages", packageName,
                   version);
};

tropohouse.downloadSpecifiedBuild = function (buildRecord) {
  // XXX nb: "version" field is calculated by getBuildsForArches
  var path = tropohouse.downloadedBuildPath(
    buildRecord.packageName, buildRecord.version, buildRecord.architecture);
  var packageTarball = httpHelpers.getUrl({
      url: buildRecord.build.url,
      encoding: null
  });
  files.extractTarGz(packageTarball, path);
};

// Returns true if we now have the package.
// XXX more precise error handling in offline case. maybe throw instead like
// warehouse does.
tropohouse.maybeDownloadPackageForArchitectures = function (versionInfo,
                                                            requiredArches) {
  var cat = release.current.catalog;
  var packageName = versionInfo.packageName;
  var version = versionInfo.version;

  // If this package isn't coming from the package server (loaded from
  // a checkout, or from an app package directory), don't try to
  // download it (we already have it)
  if (cat.isLocalPackage(packageName))
    return true;

  // Figure out what arches (if any) we have downloaded for this package version
  // already.
  var downloadedArches = tropohouse.downloadedArches(packageName, version);
  var archesToDownload = _.filter(requiredArches, function (requiredArch) {
    return !archinfo.mostSpecificMatch(requiredArch, downloadedArches);
  });

  if (archesToDownload.length) {
    var buildsToDownload = cat.getBuildsForArches(
      packageName, version, archesToDownload);
    if (! buildsToDownload) {
      // XXX throw a special error instead?
      return false;
    }

    // XXX how does concurrency work here?  we could just get errors if we try
    // to rename over the other thing?  but that's the same as in warehouse?
    _.each(buildsToDownload, function (build) {
      tropohouse.downloadSpecifiedBuild(build);
    });
  }

  var packageDir = tropohouse.packagePath(packageName, version);
  if (fs.existsSync(packageDir)) {
    // XXX package exists but it may need to be rebuilt if we added more slices!
    // do we have to do that here, or can we trust that the automatic rebuild
    // will work once implemented?
  } else {
    // We need to turn our builds into a unipackage.
    // XXX should this go through the library?
    var pkg = new packages.Package(null  /* no library?? */);
    var builds = tropohouse.downloadedBuilds(packageName, version);
    _.each(builds, function (build, i) {
      pkg._loadSlicesFromUnipackage(
        packageName,
        tropohouse.downloadedBuildPath(packageName, version, build),
        {firstUnipackage: i === 0});
    });
    // XXX save new buildinfo stuff so it auto-rebuilds
    pkg.saveAsUnipackage(packageDir);
  }

  return true;
};
