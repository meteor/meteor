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
  constraints = _.map(constraints, function (c) {
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
    _.each(depsMap, function (deps, depPackageName) {
      validatePackageName(depPackageName);
    });
  });

  _.each(self.dependencies, validatePackageName);
  _.each(self.upgrade, validatePackageName);
  _.each(self.constraints, function (c) {
    validatePackageName(c.package);
  });
  if (self.previousSolution) {
    _.each(_.keys(self.previousSolution),
           validatePackageName);
  }

  self._dependencySet = {}; // package name -> true
  _.each(self.dependencies, function (d) {
    self._dependencySet[d] = true;
  });
  self._upgradeSet = {};
  _.each(self.upgrade, function (u) {
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
  return _.has(this._dependencySet, p);
};

CS.Input.prototype.isUpgrading = function (p) {
  return _.has(this._upgradeSet, p);
};

CS.Input.prototype.isInPreviousSolution = function (p) {
  return !! (this.previousSolution && _.has(this.previousSolution, p));
};

CS.Input.prototype.loadFromCatalog = function (catalogLoader) {
  var self = this;

  var packagesToLoad = {}; // package -> true

  _.each(self.dependencies, function (package) {
    packagesToLoad[package] = true;
  });
  _.each(self.constraints, function (constraint) {
    packagesToLoad[constraint.package] = true;
  });
  if (self.previousSolution) {
    _.each(self.previousSolution, function (version, package) {
      packagesToLoad[package] = true;
    });
  }

  // Load packages into the cache (if they aren't loaded already).
  catalogLoader.loadAllVersionsRecursive(_.keys(packagesToLoad));
};

CS.Input.prototype.toJSONable = function () {
  var self = this;
  var obj = {
    dependencies: self.dependencies,
    constraints: _.map(self.constraints, function (c) {
      return c.toString();
    }),
    catalogCache: self.catalogCache.toJSONable()
  };

  // For readability of the resulting JSON, only include optional
  // properties that aren't the default.
  if (self.upgrade.length) {
    obj.upgrade = self.upgrade;
  }
  if (! _.isEmpty(self.anticipatedPrereleases)) {
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
    _.map(obj.constraints, function (cstr) {
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
