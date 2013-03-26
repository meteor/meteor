/// We store a "warehouse" of tools, releases and packages on
/// disk. This warehouse is populated from our servers, as needed.
///
/// Directory structure:
///
///     meteor (relative path symlink to tools/latest/bin/meteor)
///     tools/ (not in checkout, since we run against checked-out code)
///       latest/ (relative path symlink to latest VERSION/ tools directory)
///       VERSION/
///     releases/
///       latest (relative path symlink to latest x.y.z.release.json)
///       x.y.z.release.json
///       x.y.z.notices.json
///     packages/
///       foo/
///         VERSION/
///
/// When running from a checkout, there is only one acceptable release - 'none', which
/// has an empty manifest, ensuring that we only load local packages (in CHECKOUT/packages
/// or within a directory in the PACKAGE_DIRS environment variable)

var path = require("path");
var fs = require("fs");
var os = require("os");
var Future = require("fibers/future");
var _ = require("underscore");

var files = require('./files.js');
var updater = require('./updater.js');
var fiberHelpers = require('./fiber-helpers.js');

var PACKAGES_URLBASE = 'https://warehouse.meteor.com';

// Like fs.symlinkSync, but creates a temporay link and renames it over the
// file; this means it works even if the file already exists.
var symlinkOverSync = function (linkText, file) {
  var tmpSymlink = file + ".tmp" + files._randomToken();
  fs.symlinkSync(linkText, tmpSymlink);
  fs.renameSync(tmpSymlink, file);
};


var warehouse = module.exports = {
  // Return our loaded collection of tools, releases and
  // packages. If we're running an installed version, found at
  // $HOME/.meteor.
  getWarehouseDir: function () {
    // a hook for tests
    if (process.env.TEST_WAREHOUSE_DIR)
      return process.env.TEST_WAREHOUSE_DIR;

    // This function should never be called unless we have a warehouse
    // (an installed version, or with process.env.TEST_WAREHOUSE_DIR
    // set)
    if (!files.usesWarehouse())
      throw new Error("There's no warehouse in a git checkout");

    return path.join(process.env.HOME, '.meteor');
  },

  getToolsDir: function (version) {
    return path.join(warehouse.getWarehouseDir(), 'tools', version);
  },

  // If you're running from a git checkout, only accept 'none' and
  // return an empty manifest.  Otherwise, ensure the passed release
  // version is stored in the local warehouse and return its parsed
  // manifest.
  releaseManifestByVersion: function(release) {
    if (release === 'none')
      return null;
    if (!files.usesWarehouse())
      throw new Error("Not in a warehouse but requesting a manifest!");

    var manifestPath = path.join(
      warehouse.getWarehouseDir(), 'releases', release + '.release.json');

    warehouse._populateWarehouseForRelease(release);

    // read from warehouse
    return JSON.parse(fs.readFileSync(manifestPath));
  },

  _latestReleaseSymlinkPath: function () {
    return path.join(warehouse.getWarehouseDir(), 'releases', 'latest');
  },

  // look in the warehouse for the latest release version. if no
  // releases are found, return null.
  latestRelease: function() {
    var latestReleaseSymlink = warehouse._latestReleaseSymlinkPath();
    try {
      var linkText = fs.readlinkSync(latestReleaseSymlink);
    } catch (e) {
      return null;
    }
    return linkText.replace(/\.release\.json$/, '');
  },

  _latestToolsSymlinkPath: function () {
    return path.join(warehouse.getWarehouseDir(), 'tools', 'latest');
  },

  // Look in the warehouse for the latest tools version. (This is the one that
  // the meteor shell script runs initially). If the symlink doesn't exist
  // (which shouldn't happen, since it is provided in the bootstrap tarball)
  // returns null.
  latestTools: function() {
    var latestToolsSymlink = warehouse._latestToolsSymlinkPath();
    try {
      return fs.readlinkSync(latestToolsSymlink);
    } catch (e) {
      return null;
    }
  },

  // returns true if we updated the latest symlink
  // XXX make errors prettier
  fetchLatestRelease: function (background) {
    var manifest = updater.getManifest();

    // XXX in the future support release channels other than stable
    var releaseName = manifest && manifest.releases &&
          manifest.releases.stable && manifest.releases.stable.version;
    if (!releaseName) {
      if (background)
        return false;  // it's in the background, who cares.
      console.error("No stable release found.");
      process.exit(1);
    }

    warehouse._populateWarehouseForRelease(releaseName, background);
    var latestReleaseManifest = warehouse.releaseManifestByVersion(releaseName);

    // First, make sure the latest tools symlink reflects the latest installed
    // release.
    if (latestReleaseManifest.tools !== warehouse.latestTools()) {
      symlinkOverSync(latestReleaseManifest.tools,
                      warehouse._latestToolsSymlinkPath());
    }

    var storedLatestRelease = warehouse.latestRelease();
    if (storedLatestRelease && storedLatestRelease === releaseName)
      return false;

    symlinkOverSync(releaseName + '.release.json',
                    warehouse._latestReleaseSymlinkPath());
    return true;
  },

  packageExistsInWarehouse: function (name, version) {
    // Look for presence of "package.js" file in directory so we don't count
    // an empty dir as a package.  An empty dir could be left by a failed
    // package untarring, for example.
    return fs.existsSync(
      path.join(warehouse.getWarehouseDir(), 'packages', name, version, 'package.js'));
  },

  toolsExistsInWarehouse: function (version) {
    return fs.existsSync(warehouse.getToolsDir(version));
  },

  // fetches the manifest file for the given release version. also fetches
  // all of the missing versioned packages referenced from the release manifest
  // @param releaseVersion {String} eg "0.1"
  _populateWarehouseForRelease: function(releaseVersion, background) {
    var future = new Future;
    var releasesDir = path.join(warehouse.getWarehouseDir(), 'releases');
    files.mkdir_p(releasesDir, 0755);
    var releaseManifestPath = path.join(releasesDir,
                                        releaseVersion + '.release.json');

    if (fs.existsSync(releaseManifestPath))
      return;

    // get release manifest, but only write it after we're done
    // writing packages
    try {
      var releaseManifestText = files.getUrl(
        PACKAGES_URLBASE + "/releases/" + releaseVersion + ".release.json");
      var releaseManifest = JSON.parse(releaseManifestText);
    } catch (e) {
      if (background)
        throw e;  // just throw, it's being ignored
      // XXX Maybe instead of these process.exit's we can throw some special
      // error class?
      console.error("Release hasn't been published to Meteor's servers: " + releaseVersion);
      process.exit(1);
    }

    // try getting the releases's notices. notable only blessed
    // releases have one, so if we can't find it just proceed
    try {
      var notices = files.getUrl(
        PACKAGES_URLBASE + "/releases/" + releaseVersion + ".notices.json");

      // If a file is not on S3 we get served an 'access denied' XML
      // file. This will throw (intentionally) in that case. Real
      // notices are valid JSON.
      JSON.parse(notices);

      fs.writeFileSync(path.join(releasesDir, releaseVersion + '.notices.json'), notices);
    } catch (e) {
      // no notices, proceed
    }

    // populate warehouse with tools version for this release
    var toolsVersion = releaseManifest.tools;
    if (!warehouse.toolsExistsInWarehouse(toolsVersion)) {
      try {
        if (!background)
          console.log("Fetching Meteor Tools " + toolsVersion + "...");
        warehouse.downloadToolsToWarehouse(
          toolsVersion,
          warehouse._unameAndArch(),
          warehouse.getWarehouseDir());
      } catch (e) {
        if (!background)
          console.error("Failed to load tools for release " + releaseVersion);
        throw e;
      }
    }

    // populate warehouse with missing packages
    try {
      var missingPackages = {};
      _.each(releaseManifest.packages, function (version, name) {
        if (!warehouse.packageExistsInWarehouse(name, version)) {
          missingPackages[name] = version;
        }
      });
      warehouse._populateWarehouseWithPackages(missingPackages, background);
    } catch (e) {
      if (!background)
        console.error("Failed to load packages for release " + releaseVersion);
      throw e;
    }

    // Now that we have written all packages, it's safe to write the
    // release manifest.
    fs.writeFileSync(releaseManifestPath, releaseManifestText);
  },

  // this function is also used by bless-release.js
  downloadToolsToWarehouse: function (
    toolsVersion, platform, warehouseDirectory) {
    // XXX this sucks. We store all the tarballs in memory. This is huge.
    // We should instead stream packages in parallel. Since the node stream
    // API is in flux, we should probably wait a bit.
    // http://blog.nodejs.org/2012/12/20/streams2/

    var toolsTarballFilename =
          "meteor-tools-" + toolsVersion + "-" + platform + ".tar.gz";
    var toolsTarballPath = "/tools/" + toolsVersion + "/"
          + toolsTarballFilename;
    var toolsTarball = files.getUrl({
      url: PACKAGES_URLBASE + toolsTarballPath,
      encoding: null
    });
    files.extractTarGz(toolsTarball,
                       path.join(warehouseDirectory, 'tools', toolsVersion));
  },

  printNotices: function(fromRelease, toRelease) {
    var noticesPath = path.join(
      warehouse.getWarehouseDir(), 'releases', toRelease + '.notices.json');

    if (fs.existsSync(path.join(noticesPath))) {
      var notices = JSON.parse(fs.readFileSync(noticesPath));
      var foundFromRelease = false;
      var newChanges = []; // acculumate change until we hit 'fromRelease'
      _.find(notices, function(change) {
        if (change.release === fromRelease) {
          foundFromRelease = true;
          return true; // exit _.find
        } else {
          newChanges.push(change);
          return false;
        }
      });

      if (foundFromRelease) {
        console.log("Important changes from " + fromRelease + ":");
        _.each(newChanges, function(change) {
          console.log(change.release + ": " + change.tagline);
          _.each(change.changes, function (changeline) {
            console.log('* ' + changeline);
          });
          console.log();
        });
      } else {
        // didn't find 'fromRelease' in the notices. must have been
        // an unofficial release.  don't print anything.
        // XXX probably print the latest only or something
      }
    }
  },

  // this function is also used by bless-release.js
  downloadPackagesToWarehouse: function (packagesToDownload,
                                         warehouseDirectory) {
    return fiberHelpers.parallelMap(
      packagesToDownload, function (version, name) {
        var packageDir = path.join(
          warehouseDirectory, 'packages', name, version);
        var packageUrl = PACKAGES_URLBASE + "/packages/" + name + "/" +
              name + '-' + version + ".tar.gz";

        var tarball = files.getUrl({url: packageUrl, encoding: null});
        files.extractTarGz(tarball, packageDir);
        return {name: name, packageDir: packageDir};
      });
  },

  // @param packagesToPopulate {Object} eg {"less": "0.5.0"}
  _populateWarehouseWithPackages: function(packagesToPopulate, background) {
    var results = warehouse.downloadPackagesToWarehouse(
      packagesToPopulate,
      warehouse.getWarehouseDir());

    _.each(results, function (result) {
      // fetch npm dependencies
      var packages = require(path.join(__dirname, "packages.js")); // load late to work around circular require
      var pkg = packages.loadFromDir(result.name, result.packageDir);
      pkg.installNpmDependencies(background /* === quiet */);
    });
  },

  _unameAndArch: function () {
    // Normalize from Node "os.arch()" to "uname -m".
    var arch = os.arch();
    if (arch === "ia32")
      arch = "i686";
    else if (arch === "x64")
      arch = "x86_64";
    else
      throw new Error("Unsupported architecture " + arch);
    return os.type() + "-" + arch;
  }
};
