var _ = require('underscore');
var packageVersionParser = require('./package-version-parser.js');
var utils = require('./utils.js');

// PackageMap: Represents the choices of package versions being used for a
// project. It knows all the packages that are used (direct and indirect
// dependencies), their versions, whether they are local or versioned packages,
// and the PackageSource object for any local packages.  Prefer using this
// function over arbitrary JSON representations when possible.  (A related class
// is projectContextModule.PackageMapFile which specifically represents the
// .meteor/packages file on disk.)
//
// It has a corresponding JSON format (used, eg, inside buildinfo files).
//
// If you specify the localCatalog option to the constructor, any package in
// that localCatalog will be considered to be local, and all others will be
// considered to be prebuilt versioned packages from troposphere.  If you do not
// specify the localCatalog option, all packages will be considered to prebuilt
// versioned packages.
exports.PackageMap = function (versions, options) {
  var self = this;
  options = options || {};
  self._map = {};
  self._localCatalog = options.localCatalog || null;

  _.each(versions, function (version, packageName) {
    var packageSource = self._localCatalog &&
          self._localCatalog.getPackageSource(packageName);
    if (packageSource) {
      self._map[packageName] =
        { kind: 'local', version: version, packageSource: packageSource };
    } else {
      self._map[packageName] =
        { kind: 'versioned', version: version, packageSource: null };
    }
  });
};

_.extend(exports.PackageMap.prototype, {
  eachPackage: function (iterator) {
    var self = this;
    _.each(self._map, function (info, packageName) {
      // For reasons that are super unclear, if this `_.clone` is inlined into
      // the `iterator` call, the value produced can mysteriously turn into
      // undefined on the way into `iterator`. Presumably some sort of memory
      // corruption, maybe Fiber-related?  Trying to minimize has been an
      // exercise in nondeterminism. But this does seem to be a sure-fire way to
      // fix it, for now. Who knows why, and who knows when it will recur again.
      var infoClone = _.clone(info);
      iterator(packageName, infoClone);
    });
  },
  getInfo: function (packageName) {
    var self = this;
    if (_.has(self._map, packageName))
      return self._map[packageName];
    return null;
  },
  makeSubsetMap: function (packageNames) {
    var self = this;
    var subsetVersions = {};
    _.each(packageNames, function (packageName) {
      var info = self.getInfo(packageName);
      if (!info)
        throw Error("not a subset: " + packageName);
      subsetVersions[packageName] = info.version;
    });
    return new exports.PackageMap(subsetVersions, {
      localCatalog: self._localCatalog
    });
  },

  toJSON: function () {
    var self = this;
    var ret = {};
    _.each(self._map, function (info, packageName) {
      if (info.kind === 'local') {
        ret[packageName] = {
          kind: 'local',
          sourceRoot: info.packageSource.sourceRoot
        };
      } else {
        ret[packageName] = {
          kind: 'versioned',
          version: info.version
        };
      }
    });
    return ret;
  },
  // Returns a map from package name to version. In most cases, this is a far
  // worse representation than PackageMap... avoid using it!
  toVersionMap: function () {
    var self = this;
    var ret = {};
    _.each(self._map, function (info, packageName) {
      ret[packageName] = info.version;
    });
    return ret;
  },

  // Given some JSON as returned from toJSON, returns true if every package in
  // the JSON has the same mapping as in this map.
  isSupersetOfJSON: function (mapJSON) {
    var self = this;
    return _.all(mapJSON, function (jsonInfo, packageName) {
      var thisInfo = self.getInfo(packageName);
      if (! thisInfo)
        return false;
      if (jsonInfo.kind !== thisInfo.kind)
        return false;
      if (thisInfo.kind === 'local') {
        return thisInfo.packageSource.sourceRoot === jsonInfo.sourceRoot;
      } else {
        return thisInfo.version === jsonInfo.version;
      }
    });
  }
});

// Static method: returns a PackageMap that represents a (catalog)
// ReleaseVersion entry (including its tool).  Note that this function assumes
// that all packages will be prebuilt versioned, not local. This is mostly used
// to create PackageMaps to pass to tropohouse.downloadPackagesMissingFromMap;
// it should not be used as part of a ProjectContext because it does not allow
// you to override release packages with local packages.
exports.PackageMap.fromReleaseVersion = function (releaseVersion) {
  var toolPackageVersion = releaseVersion.tool &&
        utils.parsePackageAtVersion(releaseVersion.tool);
  if (!toolPackageVersion)
    throw new Error("bad tool in release: " + releaseVersion.tool);
  var toolPackage = toolPackageVersion.package;
  var toolVersion = toolPackageVersion.version;

  var versionMap = _.clone(releaseVersion.packages || {});
  versionMap[toolPackage] = toolVersion;

  // As described in this function's description, all packages in this map are
  // versioned, so we do not specify a localCatalog.
  return new exports.PackageMap(versionMap);
};



// PackageMapDelta: represents the change in a PackageMap between two constraint
// solver runs.
exports.PackageMapDelta = function (options) {
  var self = this;
  self._changedPackages = {};

  options.packageMap.eachPackage(function (packageName, info) {
    var oldVersion = _.has(options.cachedVersions, packageName)
          ? options.cachedVersions[packageName] : null;
    self._storeAddOrChange(
      packageName, info, oldVersion, options.anticipatedPrereleases,
      options.neededToUseUnanticipatedPrereleases);
  });

  _.each(options.cachedVersions, function (oldVersion, packageName) {
    if (! options.packageMap.getInfo(packageName)) {
      self._storeRemove(packageName, oldVersion);
    }
  });
};

_.extend(exports.PackageMapDelta.prototype, {
  _storeAddOrChange: function (packageName, newInfo, oldVersion,
                               anticipatedPrereleases,
                               neededToUseUnanticipatedPrereleases) {
    var self = this;

    // Store nothing if nothing has changed.
    if (newInfo.version === oldVersion)
      return;

    var backwardsIncompatible =
          oldVersion !== null &&
          (packageVersionParser.majorVersion(newInfo.version) !==
           packageVersionParser.majorVersion(oldVersion));

    var isPrerelease = /-/.test(newInfo.version);
    var isAnticipatedPrerelease = _.has(anticipatedPrereleases, packageName) &&
          _.has(anticipatedPrereleases[packageName], newInfo.version);
    self._changedPackages[packageName] = {
      oldVersion: oldVersion,
      newVersion: newInfo.version,
      isBackwardsIncompatible: backwardsIncompatible,
      isUnanticipatedPrerelease: (neededToUseUnanticipatedPrereleases &&
                                  isPrerelease && !isAnticipatedPrerelease)
    };
  },

  _storeRemove: function (packageName, oldVersion) {
    var self = this;
    self._changedPackages[packageName] = {
      oldVersion: oldVersion,
      newVersion: null
    };
  },

  eachChangedPackage: function (iterator) {
    var self = this;
    _.each(self._changedPackages, function (info, packageName) {
      iterator(packageName, _.clone(info));
    });
  },

  hasChanges: function () {
    var self = this;
    return ! _.isEmpty(self._changedPackages);
  },

  displayOnConsole: function (options) {
    var self = this;
    options = _.extend({
      title: "Changes to your project's package version selections:"
    }, options);

    // Print nothing at all if nothing changed.
    if (! self.hasChanges())
      return;

    var displayItems = [];
    var anyBackwardsIncompatible = false;
    var anyUnanticipatedPrerelease = false;
    self.eachChangedPackage(function (packageName, info) {
      if (info.newVersion === null) {
        displayItems.push({
          name: packageName,
          description: "removed from your project"
        });
        return;
      }

      var name = packageName;
      if (info.isBackwardsIncompatible) {
        name += '*';
        anyBackwardsIncompatible = true;
      }
      if (info.isUnanticipatedPrerelease) {
        name += '+';
        anyUnanticipatedPrerelease = true;
      }

      var description;
      if (info.oldVersion === null) {
        description = "added, version " + info.newVersion;
      } else if (packageVersionParser.lessThan(info.oldVersion,
                                               info.newVersion)) {
        description =
          "upgraded from " + info.oldVersion + " to " + info.newVersion;
      } else {
        description =
          "downgraded from " + info.oldVersion + " to " + info.newVersion;
      }
      displayItems.push({ name: name, description: description });
    });

    var Console = require('./console.js').Console;

    Console.info();
    Console.info(options.title);
    Console.info();
    utils.printPackageList(displayItems);
    if (anyBackwardsIncompatible) {
      Console.info("\n" +
"* These packages have been updated to new versions that are not backwards\n" +
"  compatible.");
    }
    if (anyUnanticipatedPrerelease) {
      Console.info("\n" +
"+ In order to resolve constraints, we had to use experimental versions of these\n" +
"  packages.");
    }
  }
});
