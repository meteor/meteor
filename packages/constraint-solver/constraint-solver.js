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

  self.catalog = catalog;

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

    if (_.isEmpty(versionDef.dependencies)) {
      // XXX this is a hack to temporary solve the problem with packages w/o
      // dependencies. Right now in order to understand what are slices of
      // package, we look into its dependencies slice-wise. W/o dependencies we
      // would need to do something else, like see what slices other slices
      // depend on. Also if depending slices of other packages don't specify the
      // version, there is no way we can resolve what slices different versions
      // have as different versions of the same package can in theory have
      // diverging sets of slices.
      //
      // But in practive we always have main/test + os/browser slices. So we
      // will just hardcode two most improtant slices at the moment. Fix it
      // later.
      _.each(["os", "browser"], function (arch) {
        var slice = "main";
        var unitName = packageName + ":" + slice + "." + arch;
        var unitVersion = slices[unitName];
        if (! unitVersion) {
          slices[unitName] = new ConstraintSolver.UnitVersion(
            unitName, version, versionDef.earliestCompatibleVersion);
          unitVersion = slices[unitName];
          self.resolver.addUnitVersion(unitVersion);
        }
      });
    }

    // Every slice implies that if it is picked, other slices are constrained to
    // the same version.
    _.each(slices, function (slice, sliceName) {
      _.each(slices, function (other, otherSliceName) {
        if (slice === other)
          return;

        // Constraint is the exact same version of a slice
        var constraintStr = "=" + version;
        var constraint =
          self.resolver.getConstraint(otherSliceName, constraintStr);
        slice.addConstraint(constraint);
      });
    });
  });
};

ConstraintSolver.PackagesResolver.prototype.resolve =
  function (dependencies, options) {
  var self = this;

  options = _.defaults(options || {}, {
    mode: 'LATEST'
  });

  var dc = self._splitDepsToConstraints(dependencies);

  var resolverOptions = self._getResolverOptions(options, dc);

  // XXX resolver.resolve can throw an error, should have error handling with
  // proper error translation.
  var res = self.resolver.resolve(dc.dependencies, dc.constraints, [],
                                  resolverOptions);

  var resultChoices = {};
  _.each(res, function (uv) {
    // Since we don't yet define the interface for a an app to depend only on
    // certain slices of the packages (like only browser slices) and we know
    // that each slice weakly depends on other sibling slices of the same
    // version, we can safely output the whole package for each slice in the
    // result.
    resultChoices[uv.name.split(':')[0]] = uv.version;
  });

  return resultChoices;
};

ConstraintSolver.PackagesResolver.prototype.propagatedExactDeps =
  function (dependencies) {
  var self = this;
  var dc = self._splitDepsToConstraints(dependencies);

  // XXX resolver.resolve can throw an error, should have error handling with
  // proper error translation.
  var res = self.resolver.resolve(dc.dependencies, dc.constraints, null,
                                  { stopAfterFirstPropagation: true });

  var resultChoices = {};
  _.each(res, function (uv) {
    resultChoices[uv.name.split(':')[0]] = uv.version;
  });

  return resultChoices;
};

// takes deps of form {'foo': '1.2.3', 'bar': null, 'quz': '=1.2.5'} and splits
// them into dependencies ['foo:main.os', 'bar:main.browser',
// 'quz:main.browser'] + constraints
// XXX right now creates a dependency for every 'main' slice it can find
ConstraintSolver.PackagesResolver.prototype._splitDepsToConstraints =
  function (deps) {
  var self = this;
  var dependencies = [];
  var constraints = [];
  var slicesNames = _.keys(self.resolver.unitsVersions);

  _.each(deps, function (constraint, packageName) {
    var slicesForPackage = _.filter(slicesNames, function (slice) {
      // we pick everything that starts with 'foo:main.'
      var slicePrefix = packageName + ":main.";
      return slice.substr(0, slicePrefix.length) === slicePrefix;
    });

    if (_.isEmpty(slicesForPackage))
      throw new Error("Resolver has no knowldge about package: " + packageName);

    _.each(slicesForPackage, function (sliceName) {
      dependencies.push(sliceName);

      // add the constraint if such exists
      if (constraint !== null && constraint !== "none") {
        constraints.push(self.resolver.getConstraint(sliceName, constraint));
      }
    });
  });

  return { dependencies: dependencies, constraints: constraints };
};

ConstraintSolver.PackagesResolver.prototype._getResolverOptions =
  function (options, dc) {
  var resolverOptions = {};
  switch (options.mode) {
  case "LATEST":
    resolverOptions.costFunction = function (choices) {
      var c = _.reduce(choices, function (sum, uv) {
        var v = _.map(uv.version.split('.'), function (x, i, array) {
          return parseInt(x);
        });

        return v[0] * 10000 + v[1] * 100 + v[2] + sum;
      }, 0);
    };

    break;
  }

  return resolverOptions;
};

