// This file is used to access the "warehouse" of pre-0.9.0 releases. This code
// is now legacy, but we keep it around so that you can still use the same
// `meteor` entry point to run pre-0.9.0 and post-0.9.0 releases, for now. All
// it knows how to do is download old releases and explain to main.js how to
// exec them.
//
// Because of this, we do have to be careful that the files used by this code
// and the files used by tropohouse.js (the modern version of the warehouse)
// don't overlap. tropohouse does not use tools or releases directorys, and
// while they both have packages directories with similar structures, the
// version names should not overlap: warehouse versions are SHAs and tropohouse
// versions are semvers.  Additionally, while they do both use the 'meteor'
// symlink at the top level, there's no actual code in this file to write that
// symlink (it was just created by the bootstrap tarball release process).


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

var os = require("os");
var Future = require("fibers/future");
var _ = require("underscore");

var files = require('../fs/files.js');
var httpHelpers = require('../utils/http-helpers.js');
var fiberHelpers = require('../utils/fiber-helpers.js');

var WAREHOUSE_URLBASE = 'https://warehouse.meteor.com';

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
    if (process.env.METEOR_WAREHOUSE_DIR) {
      return files.convertToStandardPath(process.env.METEOR_WAREHOUSE_DIR);
    }

    // This function should never be called unless we have a warehouse
    // (an installed version, or with process.env.METEOR_WAREHOUSE_DIR
    // set)
    if (!files.usesWarehouse()) {
      throw new Error("There's no warehouse in a git checkout");
    }

    return files.pathJoin(files.getHomeDir(), '.meteor');
  },

  getToolsDir: function (version) {
    return files.pathJoin(warehouse.getWarehouseDir(), 'tools', version);
  },

  getToolsFreshFile: function (version) {
    return files.pathJoin(warehouse.getWarehouseDir(), 'tools', version, '.fresh');
  },

  _latestReleaseSymlinkPath: function () {
    return files.pathJoin(warehouse.getWarehouseDir(), 'releases', 'latest');
  },

  _latestToolsSymlinkPath: function () {
    return files.pathJoin(warehouse.getWarehouseDir(), 'tools', 'latest');
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
    if (!files.usesWarehouse()) {
      throw new Error("Not in a warehouse but requesting a manifest!");
    }

    return warehouse._populateWarehouseForRelease(release, !quiet);
  },

  packageExistsInWarehouse: function (name, version) {
    // A package exists if its directory exists. (We used to look for a
    // particular file name ("package.js") inside the directory, but since we
    // always install packages by untarring to a temporary directory and
    // renaming atomically, we shouldn't worry about partial packages.)
    return files.exists(
      files.pathJoin(warehouse.getWarehouseDir(), 'packages', name, version));
  },

  getPackageFreshFile: function (name, version) {
    return files.pathJoin(
      warehouse.getWarehouseDir(),
      'packages', name, version, '.fresh');
  },

  toolsExistsInWarehouse: function (version) {
    return files.exists(warehouse.getToolsDir(version));
  },

  // Returns true if we already have the release file on disk, and it's not a
  // fake "red pill" release --- we should never springboard to those!
  realReleaseExistsInWarehouse: function (version) {
    var releasesDir = files.pathJoin(warehouse.getWarehouseDir(), 'releases');
    var releaseManifestPath = files.pathJoin(releasesDir,
                                        version + '.release.json');
    try {
      var manifest = JSON.parse(files.readFile(releaseManifestPath, 'utf8'));
      return !manifest.redPill;
    } catch (e) {
      return false;
    }
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
    } else if (files.exists(warehouse.getToolsFreshFile(toolsVersion))) {
      newPieces.tools = {version: toolsVersion, needsDownload: false};
    }

    _.each(releaseManifest.packages, function (version, name) {
      if (!warehouse.packageExistsInWarehouse(name, version)) {
        newPieces.packages[name] = {version: version, needsDownload: true};
      } else if (files.exists(warehouse.getPackageFreshFile(name, version))) {
        newPieces.packages[name] = {version: version, needsDownload: false};
      }
    });
    if (newPieces.tools || !_.isEmpty(newPieces.packages)) {
      return newPieces;
    }
    return null;
  },

  _packageUpdatesMessage: function (packageNames) {
    var lines = [];
    var width = 80;  // see utils.printPackageList for why we hardcode this
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
    var releasesDir = files.pathJoin(warehouse.getWarehouseDir(), 'releases');
    files.mkdir_p(releasesDir, 0o755);
    var releaseManifestPath = files.pathJoin(releasesDir,
                                             releaseVersion + '.release.json');

    // If the release already exists, we don't have to do anything, except maybe
    // print a message if this release has never been used before (and we only
    // have it due to a background download).
    var releaseAlreadyExists = true;
    try {
      var releaseManifestText = files.readFile(releaseManifestPath);
    } catch (e) {
      releaseAlreadyExists = false;
    }

    // Now get release manifest if we don't already have it, but only write it
    // after we're done writing packages
    if (!releaseAlreadyExists) {

      // For automated self-test. If METEOR_TEST_FAIL_RELEASE_DOWNLOAD
      // is 'offline' or 'not-found', make release downloads fail.
      if (process.env.METEOR_TEST_FAIL_RELEASE_DOWNLOAD === "offline") {
        throw new files.OfflineError(new Error("scripted failure for tests"));
      }
      if (process.env.METEOR_TEST_FAIL_RELEASE_DOWNLOAD === "not-found") {
        throw new warehouse.NoSuchReleaseError;
      }

      try {
        var result = httpHelpers.request(
          WAREHOUSE_URLBASE + "/releases/" + releaseVersion + ".release.json");
      } catch (e) {
        throw new files.OfflineError(e);
      }

      if (result.response.statusCode !== 200) {
        // We actually got some response, so we're probably online and we
        // just can't find the release.
        throw new warehouse.NoSuchReleaseError;
      }

      releaseManifestText = result.body;
    }

    var releaseManifest = JSON.parse(releaseManifestText);

    var newPieces = warehouse._calculateNewPiecesForRelease(releaseManifest);

    if (releaseAlreadyExists && !newPieces) {
      return releaseManifest;
    }

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
          if (showInstalling) {
            console.error("Failed to load tools for release " + releaseVersion);
          }
          throw e;
        }

        // If the 'tools/latest' symlink doesn't exist, this must be the first
        // legacy tools we've downloaded into this warehouse. Add the symlink,
        // so that the tools doesn't get confused when it tries to readlink it.
        if (!files.exists(warehouse._latestToolsSymlinkPath())) {
          files.symlink(newPieces.tools.version,
                         warehouse._latestToolsSymlinkPath());
        }
      }

      var packagesToDownload = {};
      _.each(newPieces && newPieces.packages, function (packageInfo, name) {
        if (packageInfo.needsDownload) {
          packagesToDownload[name] = packageInfo.version;
        }
      });
      if (!_.isEmpty(packagesToDownload)) {
        try {
          warehouse.downloadPackagesToWarehouse(packagesToDownload,
                                                warehouse._platform(),
                                                warehouse.getWarehouseDir());
        } catch (e) {
          if (showInstalling) {
            console.error("Failed to load packages for release " +
                          releaseVersion);
          }
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

        files.writeFile(
          files.pathJoin(releasesDir, releaseVersion + '.notices.json'),
          notices);
      } catch (e) {
        // no notices, proceed
      }

      // Now that we have written all packages, it's safe to write the
      // release manifest.
      files.writeFile(releaseManifestPath, releaseManifestText);

      // If the 'releases/latest' symlink doesn't exist, this must be the first
      // legacy release manifest we've downloaded into this warehouse. Add the
      // symlink, so that the tools doesn't get confused when it tries to
      // readlink it.
      if (!files.exists(warehouse._latestReleaseSymlinkPath())) {
        files.symlink(releaseVersion + '.release.json',
                       warehouse._latestReleaseSymlinkPath());
      }
    }

    // Finally, clear the "fresh" files for all the things we just printed
    // (whether or not we just downloaded them). (Don't do this if we didn't
    // print the installing message!)
    if (newPieces && showInstalling) {
      var unlinkIfExists = function (file) {
        try {
          files.unlink(file);
        } catch (e) {
          // If two processes populate the warehouse in parallel, the other
          // process may have deleted the fresh file. That's OK!
          if (e.code === "ENOENT") {
            return;
          }
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
    files.extractTarGz(
      toolsTarball, files.pathJoin(warehouseDirectory, 'tools', toolsVersion));
    if (!dontWriteFreshFile) {
      files.writeFile(warehouse.getToolsFreshFile(toolsVersion), '');
    }
  },

  // this function is also used by bless-release.js
  downloadPackagesToWarehouse: function (packagesToDownload,
                                         platform,
                                         warehouseDirectory,
                                         dontWriteFreshFile) {
    fiberHelpers.parallelEach(
      packagesToDownload, function (version, name) {
        var packageDir = files.pathJoin(
          warehouseDirectory, 'packages', name, version);
        var packageUrl = WAREHOUSE_URLBASE + "/packages/" + name +
              "/" + version +
              "/" + name + '-' + version + "-" + platform + ".tar.gz";

        var tarball = httpHelpers.getUrl({url: packageUrl, encoding: null});
        files.extractTarGz(tarball, packageDir);
        if (!dontWriteFreshFile) {
          files.writeFile(warehouse.getPackageFreshFile(name, version), '');
        }
      });
  },

  _platform: function () {
    // Normalize from Node "os.arch()" to "uname -m".
    var arch = os.arch();
    if (arch === "ia32") {
      arch = "i686";
    } else if (arch === "x64") {
      arch = "x86_64";
    } else {
      throw new Error("Unsupported architecture " + arch);
    }
    return os.type() + "_" + arch;
  }
});
