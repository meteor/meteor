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
/// The warehouse is not used at all when running from a
/// checkout. Only local packages will be loaded (from
/// CHECKOUT/packages or within a directory in the PACKAGE_DIRS
/// environment variable). The setup of that is handled by release.js.

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

var WAREHOUSE_URLBASE = 'https://warehouse.meteor.com';

// Like fs.symlinkSync, but creates a temporay link and renames it over the
// file; this means it works even if the file already exists.
var symlinkOverSync = function (linkText, file) {
  var tmpSymlink = file + ".tmp" + utils.randomToken();
  fs.symlinkSync(linkText, tmpSymlink);
  fs.renameSync(tmpSymlink, file);
};

var warehouse = exports;
_.extend(warehouse, {
  // An exception meaning that you asked for a release that doesn't
  // exist.
  NoSuchReleaseError: function () {
  },

  // Return our loaded collection of tools, releases and
  // packages. If we're running an installed version, found at
  // $HOME/.meteor.
  getWarehouseDir: function () {
    // a hook for tests, or i guess for users.
    if (process.env.METEOR_WAREHOUSE_DIR)
      return process.env.METEOR_WAREHOUSE_DIR;

    // This function should never be called unless we have a warehouse
    // (an installed version, or with process.env.METEOR_WAREHOUSE_DIR
    // set)
    if (!files.usesWarehouse())
      throw new Error("There's no warehouse in a git checkout");

    return path.join(process.env.HOME, '.meteor');
  },

  getToolsDir: function (version) {
    return path.join(warehouse.getWarehouseDir(), 'tools', version);
  },

  getToolsFreshFile: function (version) {
    return path.join(warehouse.getWarehouseDir(), 'tools', version, '.fresh');
  },

  // Ensure the passed release version is stored in the local
  // warehouse and return its parsed manifest.
  //
  // If 'quiet' is true, don't print anything as we do it.
  //
  // Throws:
  // - files.OfflineError if the release isn't cached locally and we
  //   are offline.
  // - warehouse.NoSuchReleaseError if we talked to the server and it
  //   told us that no release named 'release' exists.
  ensureReleaseExistsAndReturnManifest: function (release, quiet) {
    if (!files.usesWarehouse())
      throw new Error("Not in a warehouse but requesting a manifest!");

    var manifestPath = path.join(
      warehouse.getWarehouseDir(), 'releases', release + '.release.json');

    return warehouse._populateWarehouseForRelease(release, !quiet);
  },

  _latestReleaseSymlinkPath: function () {
    return path.join(warehouse.getWarehouseDir(), 'releases', 'latest');
  },

  // look in the warehouse for the latest release version. if no
  // releases are found, return null.
  latestRelease: function () {
    var latestReleaseSymlink = warehouse._latestReleaseSymlinkPath();
    // This throws if the symlink doesn't exist, but it really should, since
    // it exists in bootstrap tarballs and is never deleted.
    var linkText = fs.readlinkSync(latestReleaseSymlink);
    return linkText.replace(/\.release\.json$/, '');
  },

  _latestToolsSymlinkPath: function () {
    return path.join(warehouse.getWarehouseDir(), 'tools', 'latest');
  },

  // Look in the warehouse for the latest tools version. (This is the one that
  // the meteor shell script runs initially). If the symlink doesn't exist
  // (which shouldn't happen, since it is provided in the bootstrap tarball)
  // returns null.
  latestTools: function () {
    var latestToolsSymlink = warehouse._latestToolsSymlinkPath();
    try {
      return fs.readlinkSync(latestToolsSymlink);
    } catch (e) {
      return null;
    }
  },

  // returns true if we updated the latest symlink
  // XXX make errors prettier
  fetchLatestRelease: function (options) {
    options = options || {};
    var manifest = updater.getManifest();

    // XXX in the future support release channels other than stable
    var releaseName = manifest && manifest.releases &&
          manifest.releases.stable && manifest.releases.stable.version;
    if (! releaseName)
      throw new Error("no stable release found?");

    var latestReleaseManifest = warehouse._populateWarehouseForRelease(
      releaseName, !!options.showInstalling);

    // First, make sure the latest tools symlink reflects the latest installed
    // release.
    if (latestReleaseManifest.tools !== warehouse.latestTools()) {
      symlinkOverSync(latestReleaseManifest.tools,
                      warehouse._latestToolsSymlinkPath());
    }

    var storedLatestRelease = warehouse.latestRelease();
    if (storedLatestRelease === releaseName)
      return false;

    symlinkOverSync(releaseName + '.release.json',
                    warehouse._latestReleaseSymlinkPath());
    return true;
  },

  packageExistsInWarehouse: function (name, version) {
    // A package exists if its directory exists. (We used to look for a
    // particular file name ("package.js") inside the directory, but since we
    // always install packages by untarring to a temporary directory and
    // renaming atomically, we shouldn't worry about partial packages.)
    return fs.existsSync(
      path.join(warehouse.getWarehouseDir(), 'packages', name, version));
  },

  getPackageFreshFile: function (name, version) {
    return path.join(warehouse.getWarehouseDir(), 'packages', name, version, '.fresh');
  },

  toolsExistsInWarehouse: function (version) {
    return fs.existsSync(warehouse.getToolsDir(version));
  },

  _calculateNewPiecesForRelease: function (releaseManifest) {
    // newPieces.tools and newPieces.packages[PACKAGE] are either falsey (if
    // nothing is new), or an object with keys "version" and bool
    // "needsDownload". "needsDownload" is true if the piece is not in the
    // warehouse, and is false if it's in the warehouse but has never been used.
    var newPieces = {
      tools: null,
      packages: {}
    };

    // populate warehouse with tools version for this release
    var toolsVersion = releaseManifest.tools;
    if (!warehouse.toolsExistsInWarehouse(toolsVersion)) {
      newPieces.tools = {version: toolsVersion, needsDownload: true};
    } else if (fs.existsSync(warehouse.getToolsFreshFile(toolsVersion))) {
      newPieces.tools = {version: toolsVersion, needsDownload: false};
    }

    _.each(releaseManifest.packages, function (version, name) {
      if (!warehouse.packageExistsInWarehouse(name, version)) {
        newPieces.packages[name] = {version: version, needsDownload: true};
      } else if (fs.existsSync(warehouse.getPackageFreshFile(name, version))) {
        newPieces.packages[name] = {version: version, needsDownload: false};
      }
    });
    if (newPieces.tools || !_.isEmpty(newPieces.packages))
      return newPieces;
    return null;
  },

  _packageUpdatesMessage: function (packageNames) {
    var lines = [];
    var width = 80;  // see library.formatList for why we hardcode this
    var currentLine = ' * Package updates:';
    _.each(packageNames, function (name) {
      if (currentLine.length + 1 + name.length <= width) {
        currentLine += ' ' + name;
      } else {
        lines.push(currentLine);
        currentLine = '   ' + name;
      }
    });
    lines.push(currentLine);
    return lines.join('\n');
  },

  // fetches the manifest file for the given release version. also fetches
  // all of the missing versioned packages referenced from the release manifest
  // @param releaseVersion {String} eg "0.1"
  _populateWarehouseForRelease: function (releaseVersion, showInstalling) {
    var future = new Future;
    var releasesDir = path.join(warehouse.getWarehouseDir(), 'releases');
    files.mkdir_p(releasesDir, 0755);
    var releaseManifestPath = path.join(releasesDir,
                                        releaseVersion + '.release.json');

    // If the release already exists, we don't have to do anything, except maybe
    // print a message if this release has never been used before (and we only
    // have it due to a background download).
    var releaseAlreadyExists = true;
    try {
      var releaseManifestText = fs.readFileSync(releaseManifestPath);
    } catch (e) {
      releaseAlreadyExists = false;
    }

    // Now get release manifest if we don't already have it, but only write it
    // after we're done writing packages
    if (!releaseAlreadyExists) {

      // For automated self-test. If METEOR_TEST_FAIL_RELEASE_DOWNLOAD
      // is 'offline' or 'not-found', make release downloads fail.
      if (process.env.METEOR_TEST_FAIL_RELEASE_DOWNLOAD === "offline")
        throw new files.OfflineError(new Error("scripted failure for tests"));
      if (process.env.METEOR_TEST_FAIL_RELEASE_DOWNLOAD === "not-found")
        throw new warehouse.NoSuchReleaseError;

      try {
        var result = httpHelpers.request(
          WAREHOUSE_URLBASE + "/releases/" + releaseVersion + ".release.json");
      } catch (e) {
        throw new files.OfflineError(e);
      }

      if (result.response.statusCode !== 200)
        // We actually got some response, so we're probably online and we
        // just can't find the release.
        throw new warehouse.NoSuchReleaseError;

      releaseManifestText = result.body;
    }

    var releaseManifest = JSON.parse(releaseManifestText);

    var newPieces = warehouse._calculateNewPiecesForRelease(releaseManifest);

    if (releaseAlreadyExists && !newPieces)
      return releaseManifest;

    if (newPieces && showInstalling) {
      console.log("Installing Meteor %s:", releaseVersion);
      if (newPieces.tools) {
        console.log(" * 'meteor' build tool (version %s)",
                    newPieces.tools.version);
      }
      if (!_.isEmpty(newPieces.packages)) {
        console.log(warehouse._packageUpdatesMessage(
          _.keys(newPieces.packages).sort()));
      }
      console.log();
    }

    if (!releaseAlreadyExists) {
      if (newPieces && newPieces.tools && newPieces.tools.needsDownload) {
        try {
          warehouse.downloadToolsToWarehouse(
            newPieces.tools.version,
            warehouse._platform(),
            warehouse.getWarehouseDir());
        } catch (e) {
          if (showInstalling)
            console.error("Failed to load tools for release " + releaseVersion);
          throw e;
        }
      }

      var packagesToDownload = {};
      _.each(newPieces && newPieces.packages, function (packageInfo, name) {
        if (packageInfo.needsDownload)
          packagesToDownload[name] = packageInfo.version;
      });
      if (!_.isEmpty(packagesToDownload)) {
        try {
          warehouse.downloadPackagesToWarehouse(packagesToDownload,
                                                warehouse._platform(),
                                                warehouse.getWarehouseDir());
        } catch (e) {
          if (showInstalling)
            console.error("Failed to load packages for release " +
                          releaseVersion);
          throw e;
        }
      }

      // try getting the releases's notices. only blessed releases have one, so
      // if we can't find it just proceed.
      try {
        var notices = httpHelpers.getUrl(
          WAREHOUSE_URLBASE + "/releases/" + releaseVersion + ".notices.json");

        // Real notices are valid JSON.
        JSON.parse(notices);

        fs.writeFileSync(
          path.join(releasesDir, releaseVersion + '.notices.json'), notices);
      } catch (e) {
        // no notices, proceed
      }

      // Now that we have written all packages, it's safe to write the
      // release manifest.
      fs.writeFileSync(releaseManifestPath, releaseManifestText);
    }

    // Finally, clear the "fresh" files for all the things we just printed
    // (whether or not we just downloaded them). (Don't do this if we didn't
    // print the installing message!)
    if (newPieces && showInstalling) {
      var unlinkIfExists = function (file) {
        try {
          fs.unlinkSync(file);
        } catch (e) {
          // If two processes populate the warehouse in parallel, the other
          // process may have deleted the fresh file. That's OK!
          if (e.code === "ENOENT")
            return;
          throw e;
        }
      };

      if (newPieces.tools) {
        unlinkIfExists(warehouse.getToolsFreshFile(newPieces.tools.version));
      }
      _.each(newPieces.packages, function (packageInfo, name) {
        unlinkIfExists(
          warehouse.getPackageFreshFile(name, packageInfo.version));
      });
    }

    return releaseManifest;
  },

  // this function is also used by bless-release.js
  downloadToolsToWarehouse: function (
      toolsVersion, platform, warehouseDirectory, dontWriteFreshFile) {
    // XXX this sucks. We store all the tarballs in memory. This is huge.
    // We should instead stream packages in parallel. Since the node stream
    // API is in flux, we should probably wait a bit.
    // http://blog.nodejs.org/2012/12/20/streams2/

    var toolsTarballFilename =
          "meteor-tools-" + toolsVersion + "-" + platform + ".tar.gz";
    var toolsTarballPath = "/tools/" + toolsVersion + "/"
          + toolsTarballFilename;
    var toolsTarball = httpHelpers.getUrl({
      url: WAREHOUSE_URLBASE + toolsTarballPath,
      encoding: null
    });
    files.extractTarGz(toolsTarball,
                       path.join(warehouseDirectory, 'tools', toolsVersion));
    if (!dontWriteFreshFile)
      fs.writeFileSync(warehouse.getToolsFreshFile(toolsVersion), '');
  },

  printNotices: function (fromRelease, toRelease, packages) {
    var noticesPath = path.join(
      warehouse.getWarehouseDir(), 'releases', toRelease + '.notices.json');

    try {
      var notices = JSON.parse(fs.readFileSync(noticesPath));
    } catch (e) {
      // It's valid for this file to not exist (if it's an unblessed version)
      // and eh, if the JSON is bad then the user doesn't really care.
      return;
    }

    var noticesToPrint = [];
    // If we are updating from an app with no .meteor/release, print all
    // entries up to toRelease.
    var foundFromRelease = !fromRelease;
    for (var i = 0; i < notices.length; ++i) {
      var record = notices[i];
      // We want to print the notices for releases newer than fromRelease, and
      // we always want to print toRelease even if we're updating from something
      // that's not in the notices file at all.
      if (foundFromRelease || record.release === toRelease) {
        var noticesForRelease = record.notices || [];
        _.each(record.packageNotices, function (lines, pkgName) {
          if (_.contains(packages, pkgName)) {
            if (!_.isEmpty(noticesForRelease))
              noticesForRelease.push('');
            noticesForRelease.push.apply(noticesForRelease, lines);
          }
        });

        if (!_.isEmpty(noticesForRelease)) {
          noticesToPrint.push({release: record.release,
                               notices: noticesForRelease});
        }
      }
      // Nothing newer than toRelease.
      if (record.release === toRelease)
        break;
      if (!foundFromRelease && record.release === fromRelease)
        foundFromRelease = true;
    }

    if (_.isEmpty(noticesToPrint))
      return;

    console.log();
    console.log("-- Notice --");
    console.log();
    _.each(noticesToPrint, function (record) {
      var header = record.release + ': ';
      _.each(record.notices, function (line, i) {
        console.log(header + line);
        if (i === 0)
          header = header.replace(/./g, ' ');
      });
      console.log();
    });
  },

  // this function is also used by bless-release.js
  downloadPackagesToWarehouse: function (packagesToDownload,
                                         platform,
                                         warehouseDirectory,
                                         dontWriteFreshFile) {
    fiberHelpers.parallelEach(
      packagesToDownload, function (version, name) {
        var packageDir = path.join(
          warehouseDirectory, 'packages', name, version);
        var packageUrl = WAREHOUSE_URLBASE + "/packages/" + name +
              "/" + version +
              "/" + name + '-' + version + "-" + platform + ".tar.gz";

        var tarball = httpHelpers.getUrl({url: packageUrl, encoding: null});
        files.extractTarGz(tarball, packageDir);
        if (!dontWriteFreshFile)
          fs.writeFileSync(warehouse.getPackageFreshFile(name, version), '');
      });
  },

  _lastPrintedBannerReleaseFile: function () {
    return path.join(warehouse.getWarehouseDir(),
                     'releases', '.last-printed-banner');
  },

  lastPrintedBannerRelease: function () {
    // Calculate filename outside of try block, because getWarehouseDir can
    // throw.
    var filename = warehouse._lastPrintedBannerReleaseFile();
    try {
      return fs.readFileSync(filename, 'utf8');
    } catch (e) {
      return null;
    }
  },

  writeLastPrintedBannerRelease: function (release) {
    fs.writeFileSync(warehouse._lastPrintedBannerReleaseFile(), release);
  },

  _platform: function () {
    // Normalize from Node "os.arch()" to "uname -m".
    var arch = os.arch();
    if (arch === "ia32")
      arch = "i686";
    else if (arch === "x64")
      arch = "x86_64";
    else
      throw new Error("Unsupported architecture " + arch);
    return os.type() + "_" + arch;
  }
});
