var _ = require('underscore');

var buildmessage = require('./buildmessage.js');
var compiler = require('./compiler.js');
var files = require('./files.js');
var isopackModule = require('./isopack.js');
var utils = require('./utils.js');
var watch = require('./watch.js');
var colonConverter = require("./colon-converter.js");

exports.IsopackCache = function (options) {
  var self = this;
  options = options || {};

  // cacheDir may be null; in this case, we just don't ever save things to disk.
  self.cacheDir = options.cacheDir;

  // This is a bit of a hack, but basically: we really don't want to spend time
  // building web.cordova unibuilds in a project that doesn't have any Cordova
  // platforms. (Note that we need to be careful with 'meteor publish' to still
  // publish a web.cordova unibuild!)
  self._includeCordovaUnibuild = !! options.includeCordovaUnibuild;

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

  // Map from package name to Isopack.
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
    return self._isopacks[name];
  },

  eachBuiltIsopack: function (iterator) {
    var self = this;
    _.each(self._isopacks, function (isopack, packageName) {
      iterator(packageName, isopack);
    });
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
    var previousIsopack = null;
    if (self._previousIsopackCache &&
        _.has(self._previousIsopackCache._isopacks, name)) {
      var previousInfo = self._previousIsopackCache._packageMap.getInfo(name);
      if ((packageInfo.kind === 'versioned' &&
           previousInfo.kind === 'versioned' &&
           packageInfo.version === previousInfo.version) ||
          (packageInfo.kind === 'local' &&
           previousInfo.kind === 'local' &&
           (packageInfo.packageSource.sourceRoot ===
            previousInfo.packageSource.sourceRoot))) {
        previousIsopack = self._previousIsopackCache._isopacks[name];
      }
    }

    if (packageInfo.kind === 'local') {
      var packageNames =
            packageInfo.packageSource.getPackagesToLoadFirst(self._packageMap);
      buildmessage.enterJob("preparing to build package " + name, function () {
        _.each(packageNames, function (depName) {
          ensureLoaded(depName);
        });
        // If we failed to load something that this package depends on, don't
        // load it.
        if (buildmessage.jobHasMessages())
          return;
        self._loadLocalPackage(name, packageInfo, previousIsopack);
      });
    } else if (packageInfo.kind === 'versioned') {
      // We don't have to build this package, and we don't have to build its
      // dependencies either! Just load it from disk.

      if (!self._tropohouse) {
        throw Error("Can't load versioned packages without a tropohouse!");
      }

      var isopack = null, packagesToLoad = [];
      if (previousIsopack) {
        isopack = previousIsopack;
        packagesToLoad = isopack.getStrongOrderedUsedAndImpliedPackages();
      }
      if (! isopack) {
        // Load the isopack from disk.
        buildmessage.enterJob(
          "loading package " + name + "@" + packageInfo.version,
          function () {
            var isopackPath = self._tropohouse.packagePath(
              name, packageInfo.version);
            var Isopack = isopackModule.Isopack;
            isopack = new Isopack();
            isopack.initFromPath(name, isopackPath);
            // If loading the isopack fails, then we don't need to look for more
            // packages to load, but we should still recover by putting it in
            // self._isopacks.
            if (buildmessage.jobHasMessages())
              return;
            packagesToLoad = isopack.getStrongOrderedUsedAndImpliedPackages();
          });
      }

      self._isopacks[name] = isopack;
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

  _loadLocalPackage: function (name, packageInfo, previousIsopack) {
    var self = this;
    buildmessage.assertInCapture();
    buildmessage.enterJob("building package " + name, function () {
      var isopack;
      if (previousIsopack && self._checkUpToDatePreloaded(previousIsopack)) {
        isopack = previousIsopack;
      } else {
        // Do we have an up-to-date package on disk?
        var isopackBuildInfoJson = self.cacheDir && files.readJSONOrNull(
          self._isopackBuildInfoPath(name));
        var upToDate = self._checkUpToDate(isopackBuildInfoJson);

        if (upToDate) {
          var Isopack = isopackModule.Isopack;
          isopack = new Isopack();
          isopack.initFromPath(name, self._isopackDir(name), {
            isopackBuildInfoJson: isopackBuildInfoJson
          });
          // _checkUpToDate already verified that
          // isopackBuildInfoJson.pluginProviderPackageMap is a subset of
          // self._packageMap, so this operation is correct. (It can't be done
          // by isopack.initFromPath, because Isopack doesn't have access to the
          // PackageMap, and specifically to the local catalog it knows about.)
          isopack.setPluginProviderPackageMap(
            self._packageMap.makeSubsetMap(
              _.keys(isopackBuildInfoJson.pluginProviderPackageMap)));
        } else {
          // Nope! Compile it again.
          isopack = compiler.compile(packageInfo.packageSource, {
            packageMap: self._packageMap,
            isopackCache: self,
            noLineNumbers: self._noLineNumbers,
            includeCordovaUnibuild: self._includeCordovaUnibuild,
            includePluginProviderPackageMap: true
          });
          // Accept the compiler's result, even if there were errors (since it
          // at least will have a useful WatchSet and will allow us to keep
          // going and compile other packages that depend on this one).
          if (self.cacheDir && ! buildmessage.jobHasMessages()) {
            // Save to disk, for next time!
            isopack.saveToPath(self._isopackDir(name), {
              includeIsopackBuildInfo: true
            });
          }
        }
      }

      self.allLoadedLocalPackagesWatchSet.merge(isopack.getMergedWatchSet());
      self._isopacks[name] = isopack;
    });
  },

  _checkUpToDate: function (isopackBuildInfoJson) {
    var self = this;
    // If there isn't an isopack-buildinfo.json file, then we definitely aren't
    // up to date!
    if (! isopackBuildInfoJson)
      return false;

    // If we include Cordova but this Isopack doesn't, or via versa, then we're
    // not up to date.
    if (self._includeCordovaUnibuild !==
        isopackBuildInfoJson.includeCordovaUnibuild) {
      return false;
    }

    // Was the package built by a different compiler version?
    if (isopackBuildInfoJson.builtBy !== compiler.BUILT_BY) {
      return false;
    }

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

  _checkUpToDatePreloaded: function (previousIsopack) {
    var self = this;

    // If we include Cordova but this Isopack doesn't, or via versa, then we're
    // not up to date.
    if (self._includeCordovaUnibuild !== previousIsopack.hasCordovaUnibuild()) {
      return false;
    }

    // We don't have to check builtBy because we don't change BUILT_BY without
    // restarting the process.

    // If any of the direct dependencies changed their version or location, we
    // aren't up to date.
    if (!self._packageMap.isSupersetOfJSON(
      previousIsopack.pluginProviderPackageMap)) {
      return false;
    }
    // Merge in the watchsets for all unibuilds and plugins in the package, then
    // check it once.
    var watchSet = previousIsopack.getMergedWatchSet();
    return watch.isUpToDate(watchSet);
  },

  _isopackDir: function (packageName) {
    var self = this;
    return files.pathJoin(self.cacheDir, colonConverter.convert(packageName));
  },

  _isopackBuildInfoPath: function (packageName) {
    var self = this;
    return files.pathJoin(
      self._isopackDir(packageName), 'isopack-buildinfo.json');
  },

  forgetPreviousIsopackCache: function () {
    var self = this;
    self._previousIsopackCache = null;
  }
});
