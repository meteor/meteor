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

ConstraintSolver.Dependency = function (package, constraint, flags) {
  check(package, String);
  if (constraint) {
    check(constraint, Match.OneOf(String, VersionConstraint));
  }
  check(flags, Match.Optional(Object));

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

ConstraintSolver.PackageVersion = function (package, version) {
  check(package, String);
  check(version, String);

  this.package = package;
  this.version = version;
};
PackageVersion = ConstraintSolver.PackageVersion;

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

ConstraintSolver.CatalogCache = function () {
  // PackageVersion -> "package2" -> Dependency
  this.packageVersionToDeps = {};
};
CatalogCache = ConstraintSolver.CatalogCache;

ConstraintSolver.CatalogCache.prototype.addPackageVersion =
  function (package, version, dependencies) {
    var pv = new PackageVersion(package, version);

    // XXX
  };
