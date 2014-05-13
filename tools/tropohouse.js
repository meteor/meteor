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
var archinfo = require('./archinfo.js');
var catalog = require('./catalog.js').catalog;
var Unipackage = require('./unipackage.js').Unipackage;

var tropohouse = exports;

// Return the directory containing our loaded collection of tools, releases and
// packages. If we're running an installed version, found at $HOME/.meteor, if
// we are running form a checkout, probably at $CHECKOUT_DIR/.meteor.
tropohouse.getWarehouseDir = function () {
  // a hook for tests, or i guess for users.
  if (process.env.METEOR_WAREHOUSE_DIR)
    return process.env.METEOR_WAREHOUSE_DIR;

  var warehouseBase = files.inCheckout()
     ? files.getCurrentToolsDir() : process.env.HOME;
  // XXX This will be `.meteor` soon, once we've written the code to make the
  // tropohouse and warehouse live together in harmony (eg, allowing tropohouse
  // tools to springboard to warehouse tools).
  return path.join(warehouseBase, ".meteor0");
};

// Return the directory within the warehouse that would contain downloaded
// builds for a given package and version, if we have such builds cached on
// disk. Takes in a package name and a version, and returns the [warehouse
// path]/downloaded-builds/[packageName]/[version].
//
// This does NOT check that the directory exists or contains content.
tropohouse.downloadedBuildsDirectory = function(packageName, version) {
  return path.join(tropohouse.getWarehouseDir(), "downloaded-builds",
                   packageName, version);
};

// Return a path to a location that would contain a specified build of the
// package at the specified version, if we have this build cached on disk.
tropohouse.downloadedBuildPath = function(packageName, version, buildArches) {
  return path.join(tropohouse.downloadedBuildsDirectory(packageName, version),
                   buildArches);
};

// Returns a list of builds that we have downloaded for a package&version by
// reading the contents of that package & version's build directory. Does not
// check that the directory exists.
tropohouse.downloadedBuilds = function (packageName, version) {
  return files.readdirNoDots(
    tropohouse.downloadedBuildsDirectory(packageName, version));
};


// Returns a list of architectures that we have downloaded for a given package
// at a version: gets a list of builds from downloadedBuilds and then splits up
// each build into its component architectures, and returns a union of all
// contained architectures.
tropohouse.downloadedArches = function (packageName, version) {
  var downloadedBuilds = tropohouse.downloadedBuilds(packageName, version);
  var downloadedArches = _.reduce(
    downloadedBuilds,
    function(init, build) {
      return _.union(build.split('+'), init);
    },
    []);
  return downloadedArches;
};

// Returns the load path where one can expect to find the package, at a given
// version, if we have already downloaded from the package server. Does not
// check for contents.
//
// Returns null if the package name is lexographically invalid.
tropohouse.packagePath = function (packageName, version) {
  if (! utils.validPackageName(packageName)) {
    return null;
  }

  var loadPath = path.join(tropohouse.getWarehouseDir(), "packages",
                           packageName, version);
  return loadPath;
};

// Contacts the package server, downloads and extracts a tarball for a given
// buildRecord into the warehouse downloadedBuildPath for that build.
//
// XXX: Error handling.
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

// Given versionInfo for a package version and required architectures, checks to
// make sure that we have the package at the requested arch. If we do not have
// the package, contact the server and attempt to download and extract the right
// build. Returns true once we have the package, or false if the correct build
// does not exist on the package server.
//
// XXX more precise error handling in offline case. maybe throw instead like
// warehouse does.
tropohouse.maybeDownloadPackageForArchitectures = function (
  versionInfo, requiredArches, justGetBuilds) {
  var packageName = versionInfo.packageName;
  var version = versionInfo.version;

  // If this package isn't coming from the package server (loaded from
  // a checkout, or from an app package directory), don't try to
  // download it (we already have it)
  if (catalog.isLocalPackage(packageName))
    return true;

  // Figure out what arches (if any) we have downloaded for this package version
  // already.
  var downloadedArches = tropohouse.downloadedArches(packageName, version);
  var archesToDownload = _.filter(requiredArches, function (requiredArch) {
    return !archinfo.mostSpecificMatch(requiredArch, downloadedArches);
  });

  if (archesToDownload.length) {
    var buildsToDownload = catalog.getBuildsForArches(
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

  if (justGetBuilds) {
    return;
  }

  var packageDir = tropohouse.packagePath(packageName, version);
  if (fs.existsSync(packageDir)) {
    // Package exists for this build, so we are good.
  } else {
    // We need to turn our builds into a unipackage.
    var unipackage = new Unipackage;
    var builds = tropohouse.downloadedBuilds(packageName, version);
    _.each(builds, function (build, i) {
      unipackage._loadBuildsFromPath(
        packageName,
        tropohouse.downloadedBuildPath(packageName, version, build),
        {firstUnipackage: i === 0});
    });
    // XXX save new buildinfo stuff so it auto-rebuilds
    unipackage.saveToPath(packageDir);
  }

  return true;
};
