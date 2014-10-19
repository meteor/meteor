var _ = require('underscore');
var buildmessage = require('./buildmessage.js');
var util = require('util');
var LocalCatalog = require('./catalog-local.js').LocalCatalog;


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
      if (!_.has(self.versions, constraint.name)) {
        throw Error("Trying to resolve unknown package: " + constraint.name);
      }
      if (_.isEmpty(self.versions[constraint.name])) {
        throw Error("Trying to resolve versionless package: " + constraint.name);
      }
      if (_.size(self.versions[constraint.name]) > 1) {
        throw Error("Too many versions for package: " + constraint.name);
      }
      ret[constraint.name] = _.keys(self.versions[constraint.name])[0];
    });
    return ret;
  },


  // Given a name and a version of a package, return a path on disk
  // from which we can load it. If we don't have it on disk (we
  // haven't downloaded it, or it just plain doesn't exist in the
  // catalog) return null.
  //
  // Doesn't download packages. Downloading should be done at the time
  // that .meteor/versions is updated.
  //
  // HACK: Version can be null if you are certain that the package is to be
  // loaded from local packages. In the future, version should always be
  // required and we should confirm that the version on disk is the version that
  // we asked for. This is to support isopack loader not having a version
  // manifest.
  getLoadPathForPackage: function (name, version, constraintSolverOpts) {
    var self = this;
    self._requireInitialized();
    buildmessage.assertInCapture();
    constraintSolverOpts =  constraintSolverOpts || {};

    // Check local packages first.
    if (_.has(self.packageSources, name)) {

      // If we don't have a build of this package, we need to rebuild it.
      self._build(name, {}, constraintSolverOpts);

      // Return the path.
      return self.packageSources[name].sourceRoot;
    }

    if (! version) {
      throw new Error(name + " not a local package, and no version specified?");
    }

    var packageDir = tropohouse.default.packagePath(name, version);
    if (fs.existsSync(packageDir)) {
      return packageDir;
    }
     return null;
  }

});

exports.BootstrapCatalogCheckout = BootstrapCatalogCheckout;
