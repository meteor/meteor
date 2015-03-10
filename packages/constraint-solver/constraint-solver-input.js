var PV = PackageVersion;
var CS = ConstraintSolver;

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
  check(constraints, [PackageConstraintType]);
  constraints = _.map(constraints, function (c) {
    if (c instanceof PV.PackageConstraint) {
      return c;
    } else {
      return PV.parsePackageConstraint(c.package, c.constraintString);
    }
  });

  self.dependencies = dependencies;
  self.constraints = constraints;
  self.upgrade = options.upgrade || [];
  self.anticipatedPrereleases = options.anticipatedPrereleases || {};
  self.previousSolution = options.previousSolution || null;
  self.allowIncompatibleUpdate = options.allowIncompatibleUpdate || false;

  check(self.dependencies, [String]);
  check(self.constraints, [PV.PackageConstraint]);
  check(self.upgrade, [String]);
  check(self.anticipatedPrereleases,
        Match.ObjectWithValues(Match.ObjectWithValues(Boolean)));
  check(self.previousSolution, Match.OneOf(Object, null));

  self.catalogCache = catalogCache;
  check(self.catalogCache, CS.CatalogCache);
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
  return obj;
};

CS.Input.fromJSONable = function (obj) {
  check(obj, {
    dependencies: [String],
    constraints: [String],
    catalogCache: Object,
    anticipatedPrereleases: Match.Optional(
      Match.ObjectWithValues(Match.ObjectWithValues(Boolean))),
    previousSolution: Match.Optional(Match.OneOf(Object, null)),
    upgrade: Match.Optional([String]),
    allowIncompatibleUpdate: Match.Optional(Boolean)
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
      allowIncompatibleUpdate: obj.allowIncompatibleUpdate
    });
};

// Type description of PackageConstraint that doesn't rely on the constructor
// being correct.  Unrelatedly, objects with constructors (any constructors)
// can't be checked by "check" in the same way as plain objects, so we
// have to resort to examining the fields explicitly.

var VersionConstraintType = Match.OneOf(
  PV.VersionConstraint,
  Match.Where(function (vc) {
    check(vc.raw, String);
    check(vc.alternatives, [{
      versionString: Match.OneOf(String, null),
      type: String
    }]);
    return vc.constructor !== Object;
  }));
var PackageConstraintType = Match.OneOf(
  PV.PackageConstraint,
  Match.Where(function (c) {
    check(c.package, String);
    check(c.constraintString, String);
    check(c.versionConstraint, VersionConstraintType);
    return c.constructor !== Object;
  }));
