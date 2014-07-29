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
var catalog = require('./catalog.js');
var Unipackage = require('./unipackage.js').Unipackage;
var config = require('./config.js');

exports.Tropohouse = function (root, catalog) {
  var self = this;
  self.root = root;
  self.catalog = catalog;
};

// Return the directory containing our loaded collection of tools, releases and
// packages. If we're running an installed version, found at $HOME/.meteor, if
// we are running form a checkout, probably at $CHECKOUT_DIR/.meteor.
var defaultWarehouseDir = function () {
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

// The default tropohouse is on disk at defaultWarehouseDir() and knows not to
// download local packages; you can make your own Tropohouse to override these
// things.
exports.default = new exports.Tropohouse(
  defaultWarehouseDir(), catalog.complete);

_.extend(exports.Tropohouse.prototype, {
  // Returns the load path where one can expect to find the package, at a given
  // version, if we have already downloaded from the package server. Does not
  // check for contents.
  //
  // Returns null if the package name is lexographically invalid.
  packagePath: function (packageName, version, relative) {
    var self = this;
    if (! utils.validPackageName(packageName)) {
      return null;
    }

    var relativePath = path.join(config.getPackagesDirectoryName(),
                                 packageName, version);
    return relative ? relativePath : path.join(self.root, relativePath);
  },

  // Contacts the package server, downloads and extracts a tarball for a given
  // buildRecord into a temporary directory, whose path is returned.
  //
  // XXX: Error handling.
  downloadBuildToTempDir: function (versionInfo, buildRecord) {
    var self = this;
    var targetDirectory = files.mkdtemp();
    var packageTarball = httpHelpers.getUrl({
      url: buildRecord.build.url,
      encoding: null
    });
    files.extractTarGz(packageTarball, targetDirectory);
    return targetDirectory;
  },

  // Given versionInfo for a package version and required architectures, checks
  // to make sure that we have the package at the requested arch. If we do not
  // have the package, contact the server and attempt to download and extract
  // the right build. Returns true once we have the package, or false if the
  // correct build does not exist on the package server.
  //
  // XXX more precise error handling in offline case. maybe throw instead like
  // warehouse does.
  //
  // XXX this is kinda bogus right now and needs to be fixed when we actually
  // get around to implement cross-linking (which is the point)
  maybeDownloadPackageForArchitectures: function (versionInfo, requiredArches, verbose) {
    var self = this;
    var packageName = versionInfo.packageName;
    var version = versionInfo.version;

    // If this package isn't coming from the package server (loaded from a
    // checkout, or from an app package directory), don't try to download it (we
    // already have it)
    if (self.catalog.isLocalPackage(packageName))
      return true;

    // Figure out what arches (if any) we have loaded for this package version
    // already.
    var packageLinkFile = self.packagePath(packageName, version);
    var downloadedArches = [];
    var packageLinkTarget = null;
    try {
      packageLinkTarget = fs.readlinkSync(packageLinkFile);
    } catch (e) {
      // Complain about anything other than "we don't have it at all". This
      // includes "not a symlink": The main reason this would not be a symlink
      // is if it's a directory containing a pre-0.9.0 package (ie, this is a
      // warehouse package not a tropohouse package). But the versions should
      // not overlap: warehouse versions are truncated SHAs whereas tropohouse
      // versions should be semver.
      if (e.code !== 'ENOENT')
        throw e;
    }
    if (packageLinkTarget) {
      // The symlink will be of the form '.VERSION.RANDOMTOKEN++browser+os',
      // so this strips off the part before the '++'.
      // XXX maybe we should just read the unipackage.json instead of
      //     depending on the symlink?
      var archPart = packageLinkTarget.split('++')[1];
      if (!archPart)
        throw Error("unexpected symlink target for " + packageName + "@" +
                    version + ": " + packageLinkTarget);
      downloadedArches = archPart.split('+');
    }

    var archesToDownload = _.filter(requiredArches, function (requiredArch) {
      return !archinfo.mostSpecificMatch(requiredArch, downloadedArches);
    });

    // Have everything we need? Great.
    if (!archesToDownload.length) {
      return true;
    }

    var buildsToDownload = self.catalog.getBuildsForArches(
      packageName, version, archesToDownload);
    if (! buildsToDownload) {
      throw new Error(
        "No compatible build found for " + packageName + "@" + version);
    }

    // XXX replace with a real progress bar in _ensurePackagesExistOnDisk
    if (verbose) {
      process.stderr.write(
        "  downloading " + packageName + " at version " + version + " ... ");
    }

    var buildTempDirs = [];
    // If there's already a package in the tropohouse, start with it.
    if (packageLinkTarget) {
      buildTempDirs.push(path.resolve(path.dirname(packageLinkFile),
                                      packageLinkTarget));
    }
    // XXX how does concurrency work here?  we could just get errors if we try
    // to rename over the other thing?  but that's the same as in warehouse?
    _.each(buildsToDownload, function (build) {
      buildTempDirs.push(self.downloadBuildToTempDir(versionInfo, build));
    });

    // We need to turn our builds into a single unipackage.
    var unipackage = new Unipackage;
    _.each(buildTempDirs, function (buildTempDir, i) {
      unipackage._loadUnibuildsFromPath(
        packageName,
        buildTempDir,
        {firstUnipackage: i === 0});
    });
    // XXX include the version in it too?
    var newPackageLinkTarget = '.' + version + '.'
          + utils.randomToken() + '++' + unipackage.buildArchitectures();
    var combinedDirectory = self.packagePath(packageName, newPackageLinkTarget);
    // XXX save new buildinfo stuff so it auto-rebuilds
    unipackage.saveToPath(combinedDirectory);
    files.symlinkOverSync(newPackageLinkTarget, packageLinkFile);

    // Clean up old version.
    if (packageLinkTarget) {
      files.rm_recursive(self.packagePath(packageName, packageLinkTarget));
    }

    if (verbose) {
      process.stderr.write(" done\n");
    }

    return true;
  },

  latestMeteorSymlink: function () {
    var self = this;
    var linkPath = path.join(self.root, 'meteor');
    return fs.readlinkSync(linkPath);
  },

  replaceLatestMeteorSymlink: function (linkText) {
    var self = this;
    var linkPath = path.join(self.root, 'meteor');
    files.symlinkOverSync(linkText, linkPath);
  }
});
