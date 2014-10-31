var _ = require('underscore');
var util = require('util');
var fs = require('fs');
var buildmessage = require('./buildmessage.js');
var LocalCatalog = require('./catalog-local.js').LocalCatalog;
var tropohouse = require('./tropohouse.js');

// BootstrapCatalogCheckout represents a catalog of the packages at bootstrap
// when we are running in checkout mode.
// This catalog is typically never used directly by the user.
// An instance of this catalog is created in catalog.js
var BootstrapCatalogCheckout = function () {
  LocalCatalog.call(this);
};

util.inherits(BootstrapCatalogCheckout, LocalCatalog);

_.extend(BootstrapCatalogCheckout.prototype, {
  resolveConstraints: function (constraints, resolverOpts, opts) {
    var self = this;
    opts = opts || {};
    self._requireInitialized();
    buildmessage.assertInCapture();

    // uniload should always ignore the project: it's essentially loading part
    // of the tool, which shouldn't be affected by your app's dependencies.
    if (!opts.ignoreProjectDeps)
      throw Error("whoa, if for uniload, why not ignoring project?");

    // OK, we're building something while uniload
    var ret = {};
    _.each(constraints, function (constraint) {
      if (_.has(constraint, 'version')) {
        if (constraint.version !== null) {
          throw Error("Uniload specifying version? " + JSON.stringify(constraint));
        }
        delete constraint.version;
      }

      // Constraints for uniload should just be packages with no version
      // constraint and one local version (since they should all be in core).
      if (!_.has(constraint, 'name') ||
        constraint.constraints.length > 1 ||
        constraint.constraints[0].type !== 'any-reasonable') {
        throw Error("Surprising constraint: " + JSON.stringify(constraint));
      }
      if (!_.has(self.packages, constraint.name)) {
        throw Error("Trying to resolve unknown package: " + constraint.name);
      }
      ret[constraint.name] =
        self.packages[constraint.name].versionRecord.version;
    });
    return ret;
  }
});

exports.BootstrapCatalogCheckout = BootstrapCatalogCheckout;
