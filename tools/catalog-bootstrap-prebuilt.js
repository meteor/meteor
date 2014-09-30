var fs = require('fs');
var _ = require('underscore');
var packageCache = require('./package-cache.js');
var path = require('path');

// The BootstrapCatalogPrebuilt is a catalog that represents the packages used to bootstrap meteor
// It is meant to work when we are running meteor in the "real" format
// This catalog is typically never used directly by the user.
// An instance of this catalog is created in catalog.js
var BootstrapCatalogPrebuilt = function () {
  var self = this;

  // The uniload catalog needs its own package cache.
  self.packageCache = new packageCache.PackageCache(self);
};

_.extend(BootstrapCatalogPrebuilt.prototype, {
  initialize: function (options) {
    var self = this;
    if (!options.uniloadDir)
      throw Error("no uniloadDir?");
    self.uniloadDir = options.uniloadDir;

    self._knownPackages = {};
    _.each(fs.readdirSync(options.uniloadDir), function (package) {
      if (fs.existsSync(path.join(options.uniloadDir, package,
                                  'isopack.json'))) {
        self._knownPackages[package] = true;

        // XXX do we have to also put stuff in self.packages/versions/builds?
        //     probably.
      }
    });

    self.initialized = true;
  },

  resolveConstraints: function () {
    throw Error("uniload resolving constraints? that's wrong.");
  },

  // Ignores version (and constraintSolverOpts) because we just have a bunch of
  // precompiled packages.
  getLoadPathForPackage: function (name, version, constraintSolverOpts) {
    var self = this;
    if (_.has(self._knownPackages, name)) {
      return path.join(self.uniloadDir, name);
    }
    return null;
  }

});

exports.BootstrapCatalogPrebuilt = BootstrapCatalogPrebuilt;
