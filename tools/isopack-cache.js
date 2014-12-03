var _ = require('underscore');
var path = require('path');

var buildmessage = require('./buildmessage.js');
var compiler = require('./compiler.js');
var files = require('./files.js');
var isopackModule = require('./isopack.js');
var utils = require('./utils.js');
var watch = require('./watch.js');

exports.IsopackCache = function (options) {
  var self = this;
  options = options || {};

  // cacheDir may be null; in this case, we just don't ever save things to disk.
  self.cacheDir = options.cacheDir;

  // Defines the versions of packages that we build. Must be set.
  self._packageMap = options.packageMap;

  // tropohouse may be null; in this case, we can't load versioned packages.
  // eg, for building isopackets.
  self._tropohouse = options.tropohouse;

  // If provided, this is another IsopackCache for the same cache dir; when
  // loading Isopacks, if they are definitely unchanged we can load the
  // in-memory objects from this cache instead of recompiling.
  self._previousIsopackCache = options.previousIsopackCache;
  if (self._previousIsopackCache &&
      self._previousIsopackCache.cacheDir !== self.cacheDir) {
    throw Error("previousIsopackCache has different cacheDir!");
  }

  // Map from package name to {isopack, pluginProviderPackageMap} object.
  // pluginProviderPackageMap is null for isopacks that are loaded from the
  // tropohouse, and otherwise is a PackageMap object listing
  self._isopacks = {};

  self._noLineNumbers = !! options.noLineNumbers;

  self.allLoadedLocalPackagesWatchSet = new watch.WatchSet;
};

_.extend(exports.IsopackCache.prototype, {
  buildLocalPackages: function (rootPackageNames) {
    var self = this;
    buildmessage.assertInCapture();

    if (self.cacheDir)
      files.mkdir_p(self.cacheDir);

    var onStack = {};
    if (rootPackageNames) {
      _.each(rootPackageNames, function (name) {
        self._ensurePackageLoaded(name, onStack);
      });
    } else {
      self._packageMap.eachPackage(function (name, packageInfo) {
        self._ensurePackageLoaded(name, onStack);
      });
    }
  },

  wipeCachedPackages: function (packages) {
    var self = this;
    // If we're not saving things to disk, there's nothing to wipe!
    if (! self.cacheDir)
      return;
    if (packages) {
      // Wipe specific packages.
      _.each(packages, function (packageName) {
        files.rm_recursive(self._isopackDir(packageName));
      });
    } else {
      // Wipe all packages.
      files.rm_recursive(self.cacheDir);
    }
  },

  // Returns the isopack (already loaded in memory) for a given name. It is an
  // error to call this if it's not already loaded! So it should only be called
  // after buildLocalPackages has returned, or in the process of building a
  // package whose dependencies have all already been built.
  getIsopack: function (name) {
    var self = this;
    if (! _.has(self._isopacks, name))
      throw Error("isopack " + name + " not yet loaded?");
    return self._isopacks[name].isopack;
  },

  eachBuiltIsopack: function (iterator) {
    var self = this;
    _.each(self._isopacks, function (info, packageName) {
      iterator(packageName, info.isopack);
    });
  },

  getPluginProviderPackageMap: function (name) {
    var self = this;
    if (! _.has(self._isopacks, name))
      throw Error("isopack " + name + " not yet loaded?");
    return self._isopacks[name].pluginProviderPackageMap;
  },

  _ensurePackageLoaded: function (name, onStack) {
    var self = this;
    buildmessage.assertInCapture();
    if (_.has(self._isopacks, name))
      return;

    var ensureLoaded = function (depName) {
      if (_.has(onStack, depName)) {
        buildmessage.error("circular dependency between packages " +
                           name + " and " + depName);
        // recover by not enforcing one of the dependencies
        return;
      }
      onStack[depName] = true;
      self._ensurePackageLoaded(depName, onStack);
      delete onStack[depName];
    };

    var packageInfo = self._packageMap.getInfo(name);
    if (! packageInfo)
      throw Error("Depend on unknown package " + name + "?");

    if (packageInfo.kind === 'local') {
      var packageNames =
            packageInfo.packageSource.getPackagesToLoadFirst(self._packageMap);
      _.each(packageNames, function (depName) {
        ensureLoaded(depName);
      });

      self._loadLocalPackage(name, packageInfo);
    } else if (packageInfo.kind === 'versioned') {
      // We don't have to build this package, and we don't have to build its
      // dependencies either! Just load it from disk.

      if (!self._tropohouse) {
        throw Error("Can't load versioned packages without a tropohouse!");
      }

      var isopack = null, packagesToLoad = [];
      if (self._previousIsopackCache
          && _.has(self._previousIsopackCache._isopacks, name)) {
        var previousIsopack = self._previousIsopackCache._isopacks[name];
        if (previousIsopack.version === packageInfo.version) {
          isopack = previousIsopack;
          packagesToLoad = isopack.getStrongOrderedUsedAndImpliedPackages();
        }
      }
      if (! isopack) {
        // Load the isopack from disk.
        buildmessage.enterJob(
          "loading package " + name + "@" + packageInfo.version,
          function () {
            var isopackPath = self._tropohouse.packagePath(
              name, packageInfo.version);
            isopack = new isopackModule.Isopack();
            isopack.initFromPath(name, isopackPath);
            // If loading the isopack fails, then we don't need to look for more
            // packages to load, but we should still recover by putting it in
            // self._isopacks.
            if (buildmessage.jobHasMessages())
              return;
            packagesToLoad = isopack.getStrongOrderedUsedAndImpliedPackages();
          });
      }

      self._isopacks[name] = {
        isopack: isopack,
        pluginProviderPackageMap: null
      };
      // Also load its dependencies. This is so that if this package is being
      // built as part of a plugin, all the transitive dependencies of the
      // plugin are loaded.
      _.each(packagesToLoad, function (packageToLoad) {
        ensureLoaded(packageToLoad);
      });
    } else {
      throw Error("unknown packageInfo kind?");
    }
  },

  _loadLocalPackage: function (name, packageInfo) {
    var self = this;
    buildmessage.assertInCapture();
    buildmessage.enterJob("building package " + name, function () {
      // XXX #3213 use _previousIsopackCache here too (which involves moving
      // pluginProviderPackageMap into the Isopack object)

      // Do we have an up-to-date package on disk?
      var isopackBuildInfoJson = self.cacheDir && files.readJSONOrNull(
        self._isopackBuildInfoPath(name));
      var upToDate = self._checkUpToDate(isopackBuildInfoJson);

      var isopack, pluginProviderPackageMap;
      if (upToDate) {
        isopack = new isopackModule.Isopack;
        isopack.initFromPath(name, self._isopackDir(name), {
          isopackBuildInfoJson: isopackBuildInfoJson
        });
        pluginProviderPackageMap = self._packageMap.makeSubsetMap(
          _.keys(isopackBuildInfoJson.pluginProviderPackageMap));
      } else {
        // Nope! Compile it again.
        var compilerResult = compiler.compile(packageInfo.packageSource, {
          packageMap: self._packageMap,
          isopackCache: self,
          noLineNumbers: self._noLineNumbers
        });
        // Accept the compiler's result, even if there were errors (since it at
        // least will have a useful WatchSet and will allow us to keep going and
        // compile other packages that depend on this one).
        isopack = compilerResult.isopack;
        pluginProviderPackageMap = self._packageMap.makeSubsetMap(
          compilerResult.pluginProviderPackageNames);
        if (self.cacheDir && ! buildmessage.jobHasMessages()) {
          // Save to disk, for next time!
          isopack.saveToPath(self._isopackDir(name), {
            pluginProviderPackageMap: pluginProviderPackageMap,
            includeIsopackBuildInfo: true
          });
        }
      }

      self.allLoadedLocalPackagesWatchSet.merge(isopack.getMergedWatchSet());
      self._isopacks[name] = {
        isopack: isopack,
        pluginProviderPackageMap: pluginProviderPackageMap
      };
    });
  },

  _checkUpToDate: function (isopackBuildInfoJson) {
    var self = this;
    // If there isn't an isopack-buildinfo.json file, then we definitely aren't
    // up to date!
    if (! isopackBuildInfoJson)
      return false;
    // If any of the direct dependencies changed their version or location, we
    // aren't up to date.
    if (!self._packageMap.isSupersetOfJSON(
      isopackBuildInfoJson.pluginProviderPackageMap)) {
      return false;
    }
    // Merge in the watchsets for all unibuilds and plugins in the package, then
    // check it once.
    var watchSet = watch.WatchSet.fromJSON(
      isopackBuildInfoJson.pluginDependencies);

    _.each(isopackBuildInfoJson.unibuildDependencies, function (deps) {
      watchSet.merge(watch.WatchSet.fromJSON(deps));
    });
    return watch.isUpToDate(watchSet);
  },

  _isopackDir: function (packageName) {
    var self = this;
    return path.join(self.cacheDir,
                     utils.escapePackageNameForPath(packageName));
  },

  _isopackBuildInfoPath: function (packageName) {
    var self = this;
    return path.join(self._isopackDir(packageName), 'isopack-buildinfo.json');
  },

  forgetPreviousIsopackCache: function () {
    var self = this;
    self._previousIsopackCache = null;
  }
});
