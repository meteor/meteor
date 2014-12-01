ConstraintSolver = {};
PVP = Package['package-version-parser'].PackageVersion;

// A VersionConstraint wraps a string of the form "1.0.0" or
// "=1.9.1 || 2.0.0".
ConstraintSolver.VersionConstraint = function (constraintString) {
  this.constraintString = constraintString;
};
VersionConstraint = ConstraintSolver.VersionConstraint;

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
  this.packageVersionToDeps = {};
};
CatalogCache = ConstraintSolver.CatalogCache;

// Check whether the CatalogCache has an entry for a PackageVersion
// (passed as a package and a version).
ConstraintSolver.CatalogCache.prototype.hasPackageVersion =
  function (package, version) {
    var key = (new PackageVersion(package, version)).toString();
    return _.has(this.packageVersionToDeps, key);
  };

// Add an entry for a PackageVersion, consisting of a list of Dependencies.
// The PackageVersion is passed as a package and a version.  The list of
// Dependencies is an array that must not have any duplicate package names.
ConstraintSolver.CatalogCache.prototype.addPackageVersion =
  function (package, version, dependencies) {
    var self = this;

    check(dependencies, [Dependency]);

    var key = (new PackageVersion(package, version)).toString();
    if (_.has(self.packageVersionToDeps, key)) {
      throw new Error("Already have an entry for " + key);
    }
    var depsByPackage = {};
    self.packageVersionToDeps[key] = depsByPackage;

    _.each(dependencies, function (dep) {
      if (_.has(depsByPackage, dep.package)) {
        throw new Error("Can't have two dependencies on " + dep.package +
                        " in " + key);
      }
      depsByPackage[dep.package] = dep;
    });
  };

ConstraintSolver.CatalogCache.prototype.toJSONable = function () {
  var self = this;
  var data = {};
  _.each(self.packageVersionToDeps, function (depsByPackage, key) {
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
  for (var key in self.packageVersionToDeps) {
    var stop = iter(PackageVersion.fromString(key),
                    self.packageVersionToDeps[key]);
    if (stop) {
      break;
    }
  }
};
