var _ = require('underscore');

exports.PackageMap = function (versions, cat) {
  var self = this;
  self._map = {};
  self.catalog = cat;

  _.each(versions, function (version, packageName) {
    var packageSource = cat.localCatalog.getPackageSource(packageName);
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
  getVersionCatalogRecord: function (packageName) {
    var self = this;
    var info = self.getInfo(packageName);
    if (! info)
      throw Error("unknown version " + packageName);
    var record = self.catalog.getVersion(packageName, info.version);
    if (! record)
      throw Error("no catalog entry for " + packageName + "@" + info.version);
    return record;
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
