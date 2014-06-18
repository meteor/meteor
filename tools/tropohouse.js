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
  // Return the directory within the warehouse that would contain downloaded
  // builds for a given package and version, if we have such builds cached on
  // disk. Takes in a package name and a version, and returns the [warehouse
  // path]/downloaded-builds/[packageName]/[version].
  //
  // This does NOT check that the directory exists or contains content.
  downloadedBuildsDirectory: function(packageName, version) {
    var self = this;
    return path.join(self.root, "downloaded-builds", packageName, version);
  },

  // Return a path to a location that would contain a specified build of the
  // package at the specified version, if we have this build cached on disk.
  downloadedBuildPath: function(packageName, version, buildArchitectures) {
    var self = this;
    return path.join(self.downloadedBuildsDirectory(packageName, version),
                     buildArchitectures);
  },

  // Returns a list of builds that we have downloaded for a package&version by
  // reading the contents of that package & version's build directory. Does not
  // check that the directory exists.
  downloadedBuilds: function (packageName, version) {
    var self = this;
    return files.readdirNoDots(
      self.downloadedBuildsDirectory(packageName, version));
  },

  // Returns a list of architectures that we have downloaded for a given package
  // at a version: gets a list of builds from downloadedBuilds and then splits
  // up each build into its component architectures, and returns a union of all
  // contained architectures.
  downloadedArches: function (packageName, version) {
    var self = this;
    var downloadedBuilds = self.downloadedBuilds(packageName, version);
    var downloadedArches = _.reduce(
      downloadedBuilds,
      function(init, build) {
        return _.union(build.split('+'), init);
      },
      []);
    return downloadedArches;
  },

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

    var relativePath = path.join("packages", packageName, version);
    return relative ? relativePath : path.join(self.root, relativePath);
  },

  // Contacts the package server, downloads and extracts a tarball for a given
  // buildRecord into the warehouse downloadedBuildPath for that build.
  //
  // XXX: Error handling.
  downloadSpecifiedBuild: function (buildRecord) {
    var self = this;
    // XXX nb: "version" field is calculated by getBuildsForArches
    var path = self.downloadedBuildPath(
      buildRecord.packageName, buildRecord.version,
      buildRecord.buildArchitectures);
    var packageTarball = httpHelpers.getUrl({
      url: buildRecord.build.url,
      encoding: null
    });
    files.extractTarGz(packageTarball, path);
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

    var packageDir = self.packagePath(packageName, version);
    if (fs.existsSync(packageDir)) {
      // Package exists for this build, so we are good.

      // XXX this doesn't actually work! the point of this whole thing is that
      // you can fat-ify a package (eg, at deploy time) but this here assumes
      // that once you write a package you'll never write it again.
      return true;
    }

    // Figure out what arches (if any) we have downloaded for this package
    // version already.
    var downloadedArches = self.downloadedArches(packageName, version);
    var archesToDownload = _.filter(requiredArches, function (requiredArch) {
      return !archinfo.mostSpecificMatch(requiredArch, downloadedArches);
    });

    if (archesToDownload.length) {
      var buildsToDownload = self.catalog.getBuildsForArches(
        packageName, version, archesToDownload);
      if (! buildsToDownload) {
        // XXX throw a special error instead?
        return false;
      }

      // XXX replace with a real progress bar in _ensurePackagesExistOnDisk
      if (verbose) {
        process.stderr.write(
          "  downloading " + packageName + " at version " + version + " ... ");
      }

      // XXX how does concurrency work here?  we could just get errors if we try
      // to rename over the other thing?  but that's the same as in warehouse?
      _.each(buildsToDownload, function (build) {
        self.downloadSpecifiedBuild(build);
      });

      if (verbose) {
        process.stderr.write(" done\n");
      }
    }

    // We need to turn our builds into a single unipackage.
    var unipackage = new Unipackage;
    var builds = self.downloadedBuilds(packageName, version);
    _.each(builds, function (build, i) {
      unipackage._loadUnibuildsFromPath(
        packageName,
        self.downloadedBuildPath(packageName, version, build),
        {firstUnipackage: i === 0});
    });
    // XXX save new buildinfo stuff so it auto-rebuilds
    unipackage.saveToPath(packageDir);

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
