var _ = require('underscore');
var path = require('path');

var buildmessage = require('./buildmessage.js');
var catalog = require('./catalog.js');
var compiler = require('./compiler.js');
var files = require('./files.js');
var isopackCompiler = require('./isopack-compiler.js');
var isopackModule = require('./isopack.js');
var watch = require('./watch.js');

exports.IsopackCache = function (options) {
  var self = this;
  self.cacheDir = options.cacheDir;
  self.tropohouse = options.tropohouse;
  self.isopacks = {};

  files.mkdir_p(self.cacheDir);
};

_.extend(exports.IsopackCache.prototype, {
  buildLocalPackages: function (packageMap) {
    var self = this;
    buildmessage.assertInCapture();

    packageMap.eachPackage(function (name, packageInfo) {
      self._ensurePackageBuilt(name, packageMap);
    });
  },

  // Returns the isopack (already loaded in memory) for a given name. It is an
  // error to call this if it's not already loaded! So it should only be called
  // after buildLocalPackages has returned, or in the process of building a
  // package whose dependencies have all already been built.
  getIsopack: function (name) {
    var self = this;
    if (! _.has(self.isopacks, name))
      throw Error("isopack " + name + " not yet built?");
    return self.isopacks[name];
  },

  // XXX #3006 Don't infinite recurse on circular deps
  _ensurePackageBuilt: function (name, packageMap) {
    var self = this;
    buildmessage.assertInCapture();
    if (_.has(self.isopacks, name))
      return;

    var packageInfo = packageMap.getInfo(name);
    if (! packageInfo)
      throw Error("Depend on unknown package " + name + "?");

    if (packageInfo.kind === 'local') {
      var packageNames =
            packageInfo.packageSource.getPackagesToBuildFirst(packageMap);
      _.each(packageNames, function (depName) {
        self._ensurePackageBuilt(depName, packageMap);
      });

      self._loadLocalPackage(name, packageInfo, packageMap);
    } else if (packageInfo.kind === 'versioned') {
      // We don't have to build this package, and we don't have to build its
      // dependencies either! Just load it from disk.

      // Load the isopack from disk.
      buildmessage.enterJob(
        "loading package " + name + "@" + packageInfo.version,
        function () {
          var isopackPath = self.tropohouse.packagePath(
            name, packageInfo.version);
          var isopack = new isopackModule.Isopack();
          isopack.initFromPath(name, isopackPath);
          self.isopacks[name] = isopack;
        });
    } else {
      throw Error("unknown packageInfo kind?");
    }
  },

  _loadLocalPackage: function (name, packageInfo, packageMap) {
    var self = this;
    buildmessage.assertInCapture();
    buildmessage.enterJob("building package " + name, function () {
      // Do we have an up-to-date package on disk?
      var isopackBuildInfoJson = files.readJSONOrNull(
        self._isopackBuildInfoPath(name));
      var upToDate = self._checkUpToDate({
        isopackBuildInfoJson: isopackBuildInfoJson,
        packageMap: packageMap
      });

      if (upToDate) {
        var isopack = new isopackModule.Isopack;
        isopack.initFromPath(name, self._isopackDir(name));
        self.isopacks[name] = isopack;
        return;
      }

      // Nope! Compile it again.
      var compilerResult = isopackCompiler.compile(packageInfo.packageSource, {
        packageMap: packageMap,
        isopackCache: self
      });
      if (buildmessage.jobHasMessages())
        return;

      var pluginProviderPackageMap = packageMap.makeSubsetMap(
        compilerResult.pluginProviderPackageNames);
      // Save to disk, for next time!
      compilerResult.isopack.saveToPath(self._isopackDir(name), {
        pluginProviderPackageMap: pluginProviderPackageMap,
        // XXX #3006 replace with better build info
        elideBuildInfo: true,
        includeIsopackBuildInfo: true
      });

      self.isopacks[name] = compilerResult.isopack;
    });
  },

  _checkUpToDate: function (options) {
    var self = this;
    // If there isn't an isopack-buildinfo.json file, then we definitely aren't
    // up to date!
    if (options.isopackBuildInfoJson === null)
      return false;
    // If any of the direct dependencies changed their version or location, we
    // aren't up to date.
    if (!options.packageMap.isSupersetOfJSON(
      options.isopackBuildInfoJson.pluginProviderPackageMap)) {
      return false;
    }
    // Merge in the watchsets for all unibuilds and plugins in the package, then
    // check it once.
    var watchSet = watch.WatchSet.fromJSON(
      options.isopackBuildInfoJson.pluginDependencies);

    _.each(options.isopackBuildInfoJson.unibuildDependencies, function (deps) {
      watchSet.merge(watch.WatchSet.fromJSON(deps));
    });
    return watch.isUpToDate(watchSet);
  },

  _isopackDir: function (packageName) {
    var self = this;
    return path.join(self.cacheDir, packageName);
  },

  _isopackBuildInfoPath: function (packageName) {
    var self = this;
    return path.join(self.cacheDir, packageName, 'isopack-buildinfo.json');
  }
});
