var semver = Npm.require('semver');

ConstraintSolver = {};

// catalog is a catalog.Catalog object. We have to pass this in because
// we're in a package and can't require('release.js'). If this code
// moves to the tool, or if all of the tool code moves to a star, we
// should get cat from release.current.catalog rather than passing it
// in.
ConstraintSolver.PackagesResolver = function (catalog, options) {
  var self = this;

  options = options || {};

  // The main resolver
  self.resolver = new ConstraintSolver.Resolver();

  // XXX for now we convert slices to unit versions as "deps:main.os"

  var forEveryVersion = function (iter) {
    _.each(catalog.getAllPackageNames(), function (packageName) {
      _.each(catalog.getSortedVersions(packageName), function (version) {
        var versionDef = catalog.getVersion(packageName, version);
        iter(packageName, version, versionDef);
      });
    });
  };

  // Create a unit version for every package
  // Set constraints and dependencies between units
  forEveryVersion(function (packageName, version, versionDef) {
    var slices = {};
    _.each(versionDef.dependencies, function (dep, depName) {
      _.each(dep.references, function (ref) {
        var unitName = packageName + ":" + ref.slice + "." + ref.arch;
        var unitVersion = slices[unitName];
        if (! unitVersion) {
          // if it is first time we met the slice of this version, register it
          // in resolver.
          slices[unitName] = new ConstraintSolver.UnitVersion(
            unitName, version, versionDef.earliestCompatibleVersion);
          unitVersion = slices[unitName];
          self.resolver.addUnitVersion(unitVersion);
        }

        var targetSlice = ref.targetSlice || "main";
        var targetUnitName = depName + ":" + targetSlice + "." + ref.arch;

        // Add the dependency if needed
        if (! ref.weak)
          unitVersion.addDependency(targetUnitName);

        // Add a constraint if such exists
        if (dep.constraint) {
          var constraint =
            self.resolver.getConstraint(targetUnitName, dep.constraint);
          unitVersion.addConstraint(constraint);
        }
      });
    });

    // Every slice implies that if it is picked, other slices are constrained to
    // the same version.
    _.each(slices, function (slice, sliceName) {
      _.each(slices, function (other, otherSliceName) {
        if (slice === other)
          return;
        var constraint = self.resolver.getConstraint(otherSliceName, version);
        slice.addConstraint(constraint);
      });
    });
  });
};

ConstraintSolver.PackagesResolver.prototype.resolve = function (dependencies) {
  var self = this;
};

ConstraintSolver.PackagesResolver.prototype.propagatedExactDeps =
  function (dependencies) {
  var self = this;
};

