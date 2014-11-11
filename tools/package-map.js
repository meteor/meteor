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
  }
});
