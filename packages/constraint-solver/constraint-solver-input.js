const has = Npm.require('lodash.has');
const isEqual = Npm.require('lodash.isequal');
const isEmpty = Npm.require('lodash.isempty');

var PV = PackageVersion;
var CS = ConstraintSolver;

// `check` can be really slow, so this line is a valve that makes it
// easy to turn off when debugging performance problems.
var _check = check;

// The "Input" object completely specifies the input to the resolver,
// and it holds the data loaded from the Catalog as well.  It can be
// serialized to JSON and read back in for testing purposes.
CS.Input = function (dependencies, constraints, catalogCache, options) {
  var self = this;
  options = options || {};

  // PackageConstraints passed in from the tool to us (where we are a
  // uniloaded package) will have constructors that we don't recognize
  // because they come from a different copy of package-version-parser!
  // Convert them to our PackageConstraint class if necessary.  (This is
  // just top-level constraints from .meteor/packages or running from
  // checkout, so it's not a lot of data.)
  constraints = constraints.map(function (c) {
    if (c instanceof PV.PackageConstraint) {
      return c;
    } else {
      return PV.parsePackageConstraint(c.package, c.constraintString);
    }
  });

  // Note that `dependencies` and `constraints` are required (you can't
  // omit them or pass null), while the other properties have defaults.
  self.dependencies = dependencies;
  self.constraints = constraints;
  // If you add a property, make sure you add it to:
  // - The `check` statements below
  // - toJSONable (this file)
  // - fromJSONable (this file)
  // - the "input serialization" test in constraint-solver-tests.js
  // If it's an option passed in from the tool, you'll also have to
  // add it to CS.PackagesResolver#resolve.
  self.upgrade = options.upgrade || [];
  self.anticipatedPrereleases = options.anticipatedPrereleases || {};
  self.previousSolution = options.previousSolution || null;
  self.allowIncompatibleUpdate = options.allowIncompatibleUpdate || false;
  self.upgradeIndirectDepPatchVersions =
    options.upgradeIndirectDepPatchVersions || false;

  _check(self.dependencies, [String]);
  _check(self.constraints, [PV.PackageConstraint]);
  _check(self.upgrade, [String]);
  _check(self.anticipatedPrereleases,
        Match.ObjectWithValues(Match.ObjectWithValues(Boolean)));
  _check(self.previousSolution, Match.OneOf(Object, null));
  _check(self.allowIncompatibleUpdate, Boolean);
  _check(self.upgradeIndirectDepPatchVersions, Boolean);

  self.catalogCache = catalogCache;
  _check(self.catalogCache, CS.CatalogCache);
  // The catalog presumably has valid package names in it, but make sure
  // there aren't any characters in there somehow that will trip us up
  // with creating valid variable strings.
  self.catalogCache.eachPackage(function (packageName) {
    validatePackageName(packageName);
  });
  self.catalogCache.eachPackageVersion(function (packageName, depsMap) {
    Object.entries(depsMap).forEach(function ([depPackageName, deps]) {
      validatePackageName(depPackageName);
    });
  });

  self.dependencies.forEach(validatePackageName);
  self.upgrade.forEach(validatePackageName);
  self.constraints.forEach(function (c) {
    validatePackageName(c.package);
  });
  if (self.previousSolution) {
    Object.keys(self.previousSolution).forEach(
           validatePackageName);
  }

  self._dependencySet = {}; // package name -> true
  self.dependencies.forEach(function (d) {
    self._dependencySet[d] = true;
  });
  self._upgradeSet = {};
  self.upgrade.forEach(function (u) {
    self._upgradeSet[u] = true;
  });
};

validatePackageName = function (name) {
  PV.validatePackageName(name);
  // We have some hard requirements of our own so that packages can be
  // used as solver variables.  PV.validatePackageName should already
  // enforce these requirements and more, so these checks are just a
  // backstop in case it changes under us somehow.
  if ((name.charAt(0) === '$') || (name.charAt(0) === '-')) {
    throw new Error("First character of package name cannot be: " +
                    name.charAt(0));
  }
  if (/ /.test(name)) {
    throw new Error("No space allowed in package name");
  }
};

CS.Input.prototype.isKnownPackage = function (p) {
  return this.catalogCache.hasPackage(p);
};

CS.Input.prototype.isRootDependency = function (p) {
  return has(this._dependencySet, p);
};

CS.Input.prototype.isUpgrading = function (p) {
  return has(this._upgradeSet, p);
};

CS.Input.prototype.isInPreviousSolution = function (p) {
  return !! (this.previousSolution && has(this.previousSolution, p));
};

function getMentionedPackages(input) {
  var packages = {}; // package -> true

  input.dependencies.forEach(function (pkg) {
    packages[pkg] = true;
  });
  input.constraints.forEach(function (constraint) {
    packages[constraint.package] = true;
  });
  if (input.previousSolution) {
    Object.entries(input.previousSolution).forEach(function ([pkg, version]) {
      packages[pkg] = true;
    });
  }

  return Object.keys(packages);
}

CS.Input.prototype.loadFromCatalog = function (catalogLoader) {
  // Load packages into the cache (if they aren't loaded already).
  catalogLoader.loadAllVersionsRecursive(getMentionedPackages(this));
};

CS.Input.prototype.loadOnlyPreviousSolution = function (catalogLoader) {
  var self = this;

  // load just the exact versions from the previousSolution
  if (self.previousSolution) {
    Object.entries(self.previousSolution).forEach(function ([pkg, version]) {
      catalogLoader.loadSingleVersion(pkg, version);
    });
  }
};

CS.Input.prototype.isEqual = function (otherInput) {
  var a = this;
  var b = otherInput;

  // It would be more efficient to compare the fields directly,
  // but converting to JSON is much easier to implement.
  // This equality test is also overly sensitive to order,
  // missing opportunities to declare two inputs equal when only
  // the order has changed.

  // Omit `catalogCache` -- it's not actually part of the serialized
  // input object (it's only in `toJSONable()` for tests).
  //
  // Moreover, catalogCache is populated as-needed so their values for
  // `a` and `b` will very likely be different even if they represent
  // the same input. So by omitting `catalogCache` we no longer need
  // to reload the entire relevant part of the catalog from SQLite on
  // every rebuild!
  return isEqual(
    a.toJSONable(true),
    b.toJSONable(true)
  );
};

CS.Input.prototype.toJSONable = function (omitCatalogCache) {
  var self = this;
  var obj = {
    dependencies: self.dependencies,
    constraints: self.constraints.map(function (c) {
      return c.toString();
    })
  };

  if (! omitCatalogCache) {
    obj.catalogCache = self.catalogCache.toJSONable();
  }

  // For readability of the resulting JSON, only include optional
  // properties that aren't the default.
  if (self.upgrade.length) {
    obj.upgrade = self.upgrade;
  }
  if (!isEmpty(self.anticipatedPrereleases)) {
    obj.anticipatedPrereleases = self.anticipatedPrereleases;
  }
  if (self.previousSolution !== null) {
    obj.previousSolution = self.previousSolution;
  }
  if (self.allowIncompatibleUpdate) {
    obj.allowIncompatibleUpdate = true;
  }
  if (self.upgradeIndirectDepPatchVersions) {
    obj.upgradeIndirectDepPatchVersions = true;
  }

  return obj;
};

CS.Input.fromJSONable = function (obj) {
  _check(obj, {
    dependencies: [String],
    constraints: [String],
    catalogCache: Object,
    anticipatedPrereleases: Match.Optional(
      Match.ObjectWithValues(Match.ObjectWithValues(Boolean))),
    previousSolution: Match.Optional(Match.OneOf(Object, null)),
    upgrade: Match.Optional([String]),
    allowIncompatibleUpdate: Match.Optional(Boolean),
    upgradeIndirectDepPatchVersions: Match.Optional(Boolean)
  });

  return new CS.Input(
    obj.dependencies,
    obj.constraints.map(function (cstr) {
      return PV.parsePackageConstraint(cstr);
    }),
    CS.CatalogCache.fromJSONable(obj.catalogCache),
    {
      upgrade: obj.upgrade,
      anticipatedPrereleases: obj.anticipatedPrereleases,
      previousSolution: obj.previousSolution,
      allowIncompatibleUpdate: obj.allowIncompatibleUpdate,
      upgradeIndirectDepPatchVersions: obj.upgradeIndirectDepPatchVersions
    });
};