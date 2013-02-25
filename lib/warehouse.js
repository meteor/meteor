/// We store a "warehouse" of engines, releases and packages on
/// disk. This warehouse is populated from our servers, as needed.
///
/// Directory structure:
///
///     meteor (relative path symlink to engines/latest/bin/meteor)
///     engines/ (not in checkout, since we run against checked-out code)
///       latest/ (relative path symlink to latest x.y.z/ engine directory)
///       x.y.z/
///     releases/
///       x.y.z.json
///     packages/
///       foo/
///         x.y.z/

var path = require("path");
var fs = require("fs");
var os = require("os");
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
  // $CHECKOUT/.meteor.
  getWarehouseDir: function () {
    // a hook for tests
    if (process.env.TEST_WAREHOUSE_DIR)
      return process.env.TEST_WAREHOUSE_DIR;

    if (files.in_checkout())
      return path.join(files.get_core_dir(), '.meteor');
    else
      return path.join(process.env.HOME, '.meteor');
  },

  // If .meteor/release exists, load the manifest corresponding to
  // that meteor release. Load from packages.meteor.com and store in
  // the warehouse on disk. Parse and ensure that all used package
  // versions are stored.  Return parsed manifest.
  //
  // If .meteor/release does not exist, return null.
  releaseManifestForApp: function (appDir) {
    var releaseVersion = project.getMeteorReleaseVersion(appDir);

    if (!releaseVersion) {
      return null; // no manifest found
    } else {
      return warehouse.releaseManifestByVersion(releaseVersion);
    }
  },

  releaseManifestByVersion: function(releaseVersion) {
    var project = require(path.join(__dirname, 'project.js'));

    var releaseManifestPath = path.join(
      warehouse.getWarehouseDir(), 'releases', releaseVersion + '.json');

    var releaseManifest;
    if (fs.existsSync(releaseManifestPath)) {
      // read from warehouse
      releaseManifest = JSON.parse(fs.readFileSync(releaseManifestPath));
    } else {
      // grow warehouse with new manifest and packages
      releaseManifest = warehouse._populateWarehouseForRelease(releaseVersion);
    }

    return releaseManifest;
  },

  // look in the warehouse for the latest release version. if no
  // releases are found, return null.
  latestRelease: function() {
    var releasesDir = path.join(warehouse.getWarehouseDir(), 'releases');
    if (!fs.existsSync(releasesDir) || !fs.statSync(releasesDir).isDirectory())
      return null;

    var releases = fs.readdirSync(releasesDir);
    var semver = require('semver');

    var latestReleaseVersion = null;
    _.each(releases, function(file) {
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
  },

  // fetches the manifest file for the given release version. also fetches
  // all of the missing versioned packages referenced from the release manifest
  // @param releaseVersion {String} eg "0.1"
  // @returns {Object} release manifest
  _populateWarehouseForRelease: function(releaseVersion) {
    var future = new Future;
    var releasesDir = path.join(warehouse.getWarehouseDir(), 'releases');
    files.mkdir_p(releasesDir, 0755);
    var releaseManifestPath = path.join(releasesDir, releaseVersion + '.json');

    // get release manifest, but only write it after we're done
    // writing packages
    var releaseManifest;
    try {
      releaseManifest = JSON.parse(Future.wrap(files.getUrl)(
        PACKAGES_URLBASE + "/releases/" + releaseVersion + ".json").wait());
    } catch (e) {
      console.error("Can't find release " + releaseVersion);
      process.exit(1);
    }

    // populate warehouse with missing packages
    try {
      var missingPackages = {};
      _.each(releaseManifest.packages, function (version, name) {
        if (!warehouse.existsInWarehouse(name, version)) {
          missingPackages[name] = version;
        }
      });
      warehouse._populateWarehouseWithPackages(missingPackages);
    } catch (e) {
      console.error("Failed to load packages for release " + releaseVersion);
      throw e;
    }

    // now that we have written all packages, it's safe to write the
    // release manifest
    fs.writeFileSync(releaseManifestPath, JSON.stringify(releaseManifest));

    // return manifest
    return releaseManifest;
  },

  // @param packagesToPopulate {Object} eg {"less": "0.5.0"}
  _populateWarehouseWithPackages: function(packagesToPopulate) {
    var Future = require('fibers/future');
    var futures = [];
    _.each(packagesToPopulate, function (version, name) {
      var packageDir = path.join(warehouse.getWarehouseDir(), 'packages', name, version);
      var packageUrl = PACKAGES_URLBASE + "/packages/" + name + "/" +
            name + '-' + version + ".tar.gz";

      console.log("Fetching " + packageUrl + "...");
      futures.push(Future.wrap(function (cb) {
        files.getUrl({url: packageUrl, encoding: null}, function (error, result) {
          if (! error && result)
            result = { buffer: result, packageDir: packageDir, name: name };
          cb(error, result);
        });
      })());
    });

    Future.wait(futures);

    _.each(futures, function (f) {
      var result = f.get();
      // extract to a temporary directory and then rename, to ensure
      // we don't end up with a corrupt warehouse
      var tmpPackageDir = result.packageDir + ".tmp" + warehouse._randomToken();
      files.mkdir_p(tmpPackageDir);
      files.extractTarGz(result.buffer, tmpPackageDir);
      fs.renameSync(tmpPackageDir, result.packageDir);

      // fetch npm dependencies
      var packages = require(path.join(__dirname, "packages.js")); // load late to work around circular require
      var pkg = packages.loadFromDir(result.name, result.packageDir);
      pkg.installNpmDependencies();
    });
  },

  _randomToken: function() {
    return (Math.random() * 0x100000000 + 1).toString(36);
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
