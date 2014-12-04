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
exports.PackageMap = function (versions, cat) {
  var self = this;
  self._map = {};
  self.catalog = cat;

  _.each(versions, function (version, packageName) {
    var packageSource = cat.getPackageSource(packageName);
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
      iterator(packageName, _.clone(info));
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
    return new exports.PackageMap(subsetVersions, self.catalog);
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
