ConstraintSolver = {};
PVP = Package['package-version-parser'].PackageVersion;

// A VersionConstraint wraps a string of the form "1.0.0" or
// "=1.9.1 || 2.0.0".
ConstraintSolver.VersionConstraint = function (constraintString) {
  this.constraintString = constraintString;
  var parsed = PVP.parseConstraint('a@' + constraintString);
  this._alternatives = parsed.alternatives;
};
VersionConstraint = ConstraintSolver.VersionConstraint;

ConstraintSolver.VersionConstraint.prototype.isSatisfiedBy = function (v2) {
  var self = this;
  return _.some(self._alternatives, function (simpleConstraint) {
    var type = simpleConstraint.type;

    if (type === "exactly") {
      return (simpleConstraint.version === v2);
    } else if (type === 'compatible-with') {
      var version = simpleConstraint.version;

      // If the candidate version is less than the version named in the
      // constraint, we are not satisfied.
      if (PVP.lessThan(v2, version)) {
        return false;
      }

      // To be compatible, the two versions must have the same major version
      // number.
      if (PVP.majorVersion(v2) !== PVP.majorVersion(version)) {
        return false;
      }

      return true;
    } else {
      // in particular, "any-reasonable" is not allowed!
      throw Error("Bad constraint type: " + type);
    }
  });
};

ConstraintSolver.VersionConstraint.prototype.toString = function () {
  return this.constraintString;
};

ConstraintSolver.VersionConstraint.fromString = function (str) {
  return new VersionConstraint(str);
};

// A Dependency represents a dependency on package `package` with
// VersionConstraint of `constraint`.
ConstraintSolver.Dependency = function (package, constraint, flags) {
  check(package, String);
  if (constraint) {
    check(constraint, Match.OneOf(String, VersionConstraint));
  }
  if (flags != null) {
    check(flags, Object);
  }

  this.package = package;
  this.constraint = null;
  this.weak = false;

  if (constraint) {
    if (typeof constraint === 'string') {
      constraint = VersionConstraint.fromString(constraint);
    }
    this.constraint = constraint;
  }

  if (flags) {
    if (flags.weak) {
      this.weak = true;
    }
  }
};
Dependency = ConstraintSolver.Dependency;

// The string form of a Dependency is `?foo@1.0.0` for a weak
// reference to package "foo" with VersionConstraint "1.0.0".
ConstraintSolver.Dependency.prototype.toString = function () {
  var ret = this.package;
  if (this.constraint) {
    ret = ret + "@" + this.constraint.toString();
  }
  if (this.weak) {
    ret = '?' + ret;
  }
  return ret;
};

ConstraintSolver.Dependency.fromString = function (str) {
  var origStr = str;
  var package;
  var constraint = '';
  var weak = false;

  if (str.charAt(0) === '?') {
    weak = true;
    str = str.slice(1);
  }

  var parts = str.split('@');
  if (parts.length === 1 && parts[0]) {
    // no `@`
    package = str;
  } else if (parts.length === 2 && parts[0] && parts[1]) {
    package = parts[0];
    constraint = parts[1];
  } else {
    throw new Error("Malformed Dependency: " + origStr);
  }

  if (weak) {
    return new ConstraintSolver.Dependency(package, constraint,
                                           { weak: true });
  } else {
    return new ConstraintSolver.Dependency(package, constraint);
  }
};

// A PackageVersion names a (package, version) pair.
ConstraintSolver.PackageVersion = function (package, version) {
  check(package, String);
  check(version, String);

  this.package = package;
  this.version = version;
};
PackageVersion = ConstraintSolver.PackageVersion;

// The string form is "foo 1.0.1" for package "foo", version "1.0.1".
// (Using a space instead of an `@` as separator reduces visual
// confusion between PackageVersions and Dependencies when looking at
// string dumps.)
ConstraintSolver.PackageVersion.prototype.toString = function () {
  return this.package + " " + this.version;
};

ConstraintSolver.PackageVersion.fromString = function (str) {
  var parts = str.split(' ');
  if (parts.length === 2 && parts[0] && parts[1]) {
    return new ConstraintSolver.PackageVersion(parts[0], parts[1]);
  } else {
    throw new Error("Malformed PackageVersion: " + str);
  }
};

// Stores the known Dependencies for each PackageVersion.  Dependencies
// are kept in a map by their `package`, and there can only be one
// Dependency object for a given target package.
ConstraintSolver.CatalogCache = function () {
  // PackageVersion -> "package2" -> Dependency
  this._packageVersionToDeps = {};
  // A derived map for efficiency:
  // package -> [version...]
  this._packageVersionsByPackage = {};
};
CatalogCache = ConstraintSolver.CatalogCache;

// Check whether the CatalogCache has an entry for a PackageVersion
// (passed as a package and a version).
ConstraintSolver.CatalogCache.prototype.hasPackageVersion =
  function (package, version) {
    var key = (new PackageVersion(package, version)).toString();
    return _.has(this._packageVersionToDeps, key);
  };

// Add an entry for a PackageVersion, consisting of a list of Dependencies.
// The PackageVersion is passed as a package and a version.  The list of
// Dependencies is an array that must not have any duplicate package names.
ConstraintSolver.CatalogCache.prototype.addPackageVersion =
  function (package, version, dependencies) {
    var self = this;

    check(dependencies, [Dependency]);

    var key = (new PackageVersion(package, version)).toString();
    if (_.has(self._packageVersionToDeps, key)) {
      throw new Error("Already have an entry for " + key);
    }
    var depsByPackage = {};
    self._packageVersionToDeps[key] = depsByPackage;
    if (! self._packageVersionsByPackage[package]) {
      self._packageVersionsByPackage[package] = [];
    }
    self._packageVersionsByPackage[package].push(version);

    _.each(dependencies, function (dep) {
      if (_.has(depsByPackage, dep.package)) {
        throw new Error("Can't have two dependencies on " + dep.package +
                        " in " + key);
      }
      depsByPackage[dep.package] = dep;
    });
  };

// Returns the dependencies of the PackageVersion (package, version),
// stored in a map by their package name (i.e. the value is a Dependency
// `dep`, the key is `dep.package`).
ConstraintSolver.CatalogCache.prototype.getDependencyMap = function (package, version) {
  var self = this;
  var key = (new PackageVersion(package, version)).toString();
  if (! _.has(self._packageVersionToDeps, key)) {
    throw new Error("No entry for " + key);
  }
  var depsByPackage = self._packageVersionToDeps[key];
  return depsByPackage;
};

// returns an array of version strings or an empty array if there are none
ConstraintSolver.CatalogCache.prototype.getPackageVersions = function (package) {
  return this._packageVersionsByPackage[package] || [];
};

ConstraintSolver.CatalogCache.prototype.toJSONable = function () {
  var self = this;
  var data = {};
  _.each(self._packageVersionToDeps, function (depsByPackage, key) {
    data[key] = _.map(depsByPackage, function (dep) {
      return dep.toString();
    });
  });
  return { data: data };
};

ConstraintSolver.CatalogCache.fromJSONable = function (obj) {
  check(obj, { data: Object });

  var cache = new CatalogCache();
  _.each(obj.data, function (depsArray, packageVersion) {
    var pv = PackageVersion.fromString(packageVersion);
    cache.addPackageVersion(pv.package, pv.version,
                            _.map(depsArray, Dependency.fromString));
  });
  return cache;
};

// Calls `iter` on each PackageVersion, with the second argument being
// a map from package name to Dependency.  If `iter` returns true,
// iteration is stopped.
ConstraintSolver.CatalogCache.prototype.eachPackageVersion = function (iter) {
  var self = this;
  for (var key in self._packageVersionToDeps) {
    var stop = iter(PackageVersion.fromString(key),
                    self._packageVersionToDeps[key]);
    if (stop) {
      break;
    }
  }
};

// Calls `iter` on each package name, with the second argument being
// a list of versions present for that package.  If `iter` returns true,
// iteration is stopped.
ConstraintSolver.CatalogCache.prototype.eachPackage = function (iter) {
  var self = this;
  for (var key in self._packageVersionsByPackage) {
    var stop = iter(key, self.getPackageVersions(key));
    if (stop) {
      break;
    }
  }
};
