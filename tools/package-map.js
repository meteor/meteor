var _ = require('underscore');

exports.PackageMap = function (versions, cat) {
  var self = this;
  self._map = {};

  _.each(versions, function (version, name) {
    var sourceRoot = cat.localCatalog.getPackageSourceRoot(name);
    if (sourceRoot !== null) {
      self._map[name] =
        { kind: 'local', version: version, sourceRoot: sourceRoot };
    } else {
      self._map[name] =
        { kind: 'versioned', version: version, sourceRoot: null };
    }
  });
};
