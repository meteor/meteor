/// We store a "warehouse" of engine, releases and packages on
/// disk. This warehouse is populated from our servers, as needed.
///
/// Directory structure:
///
///     engines/ (not in checkout, since we run against checked-out code)
///       x.y.z/
///     releases/
///       x.y.z.json
///     packages/
///       foo/
///         x.y.z/

var path = require("path");
var fs = require("fs");
var Future = require("fibers/future");
var _ = require("underscore");

// XXX do we really need this __dirname dance? Doesn't
// require("./files.js") work?
var files = require(path.join(__dirname, "files.js"));
var project = require(path.join(__dirname, "project.js"));

var PACKAGES_URLBASE = 'https://packages.meteor.com';

var warehouse = module.exports = {
  // Return our loaded collection of engines, releases and
  // packages. If we're running an installed version, found at
  // $HOME/.meteor. If we're running a checkout, found at
  // $CHECKOUT/.meteor. This directory has the following subdirectory
  // structure:
  //
  getWarehouseDir: function () {
    if (files.in_checkout())
      return path.join(files.get_core_dir(), '.meteor');
    else
      return path.join(process.env.HOME, '.meteor');
  },

  // Load the manifest corresponding to a given meteor release from
  // packages.meteor.com and store in the warehouse, on disk. Parse
  // and ensure that all used package versions are also stored in the
  // warehouse. Return parsed manifest.
  // Load and return a manifest for an app, based on the
  // .meteor/release file
  //
  // If .meteor/release exists, load the manifest corresponding to
  // that meteor release. Load from packages.meteor.com and store in
  // the warehouse on disk. Parse and ensure that all used package
  // versions are stored.  Return parsed manifest.
  //
  // If .meteor/version does not exist, return null.
  manifestForApp: function (appDir) {
    var releaseVersion = project.getMeteorReleaseVersion(appDir);

    if (!releaseVersion) {
      return null; // no manifest found
    } else {
      return warehouse.manifestForRelease(releaseVersion);
    }
  },

  manifestForRelease: function(releaseVersion) {
    var project = require(path.join(__dirname, 'project.js'));

    var releaseManifestPath = path.join(
      warehouse.getWarehouseDir(), 'releases', releaseVersion + '.json');

    var releaseManifest;
    if (fs.existsSync(releaseManifestPath)) {
      // read from warehouse
      releaseManifest = JSON.parse(fs.readFileSync(releaseManifestPath));
    } else {
      // grow warehouse with new manifest and packages
      releaseManifest = warehouse.populateWarehouseForRelease(releaseVersion);
    }

    var Future = require('fibers/future');
    var futures = [];
    _.each(releaseManifest.packages, function (version, name) {
      if (!warehouse.existsInWarehouse(name, version)) {
        var packageDir = path.join(warehouse.getWarehouseDir(), 'packages', name, version);
        var packageUrl = PACKAGES_URLBASE + "/packages/" + name + "/" +
              name + '-' + version + ".tar.gz";

        console.log("Fetching " + packageUrl + "...");
        futures.push(Future.wrap(function (cb) {
          files.getUrl({url: packageUrl, encoding: null}, function (error, result) {
            if (! error && result)
              result = { buffer: result, packageDir: packageDir };
            cb(error, result);
          });
        })());
      }
    });

    Future.wait(futures);

    _.each(futures, function (f) {
      var result = f.get();
      files.mkdir_p(result.packageDir);
      files.extractTarGz(result.buffer, result.packageDir);
    });

    return releaseManifest;
  },

  // fetches the manifest file for the given release version. also fetches
  // all of the missing versioned packages referenced from the manifest
  // @param releaseVersion {String} eg "0.1"
  // @returns {Object} parsed manifest file
  populateWarehouseForRelease: function(releaseVersion) {
    var future = new Future;
    var releasesDir = path.join(warehouse.getWarehouseDir(), 'releases');
    files.mkdir_p(releasesDir, 0755);
    var releaseManifestPath = path.join(releasesDir, releaseVersion + '.json');

    // load the manifest from s3, and store in the warehouse
    try {
      var releaseManifest = Future.wrap(files.getUrl)(
        PACKAGES_URLBASE + "/manifest/" + releaseVersion + ".json").wait();
      fs.writeFileSync(releaseManifestPath, releaseManifest);
      return JSON.parse(manifest);
    } catch (e) {
      console.error(
        "Can't find manifest for meteor release version " + releaseVersion);
      throw e;
    }
  },

  // look in the warehouse for the latest release version
  latestRelease: function() {
    var releasesDir = path.join(warehouse.getWarehouseDir(), 'releases');
    var files = fs.readdirSync(manifestPath);
    var semver = require('semver');

    var latestReleaseVersion = null;
    _.each(files, function(file) {
      var match = /^(.*)\.json$/.exec(file);
      if (match) {
        var version = match[1];
        if (semver.valid(version) && (!latestReleaseVersion || semver.gt(version, latestReleaseVersion)))
          latestReleaseVersion = version;
      }
    });

    return latestReleaseVersion;
  },

  existsInWarehouse: function (name, version) {
    // Look for presence of "package.js" file in directory so we don't count
    // an empty dir as a package.  An empty dir could be left by a failed
    // package untarring, for example.
    return fs.existsSync(
      path.join(warehouse.getWarehouseDir(), 'packages', name, version, 'package.js'));
  }

};
