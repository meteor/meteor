ConstraintSolver = {};

var PV = PackageVersion;
var CS = ConstraintSolver;

////////// PackageAndVersion

// An ordered pair of (package, version).
CS.PackageAndVersion = function (package, version) {
  check(package, String);
  check(version, String);

  this.package = package;
  this.version = version;
};

// The string form of a PackageAndVersion is "package version",
// for example "foo 1.0.1".  The reason we don't use an "@" is
// it would look too much like a PackageConstraint.
CS.PackageAndVersion.prototype.toString = function () {
  return this.package + " " + this.version;
};

CS.PackageAndVersion.fromString = function (str) {
  var parts = str.split(' ');
  if (parts.length === 2 && parts[0] && parts[1]) {
    return new CS.PackageAndVersion(parts[0], parts[1]);
  } else {
    throw new Error("Malformed PackageAndVersion: " + str);
  }
};

////////// Dependency

// A Dependency consists of a PackageConstraint (like "foo@=1.2.3")
// and flags, like "isWeak".

CS.Dependency = function (packageConstraint, flags) {
  if (typeof packageConstraint !== 'string') {
    // this `if` is because Match.OneOf is really, really slow when it fails
    check(packageConstraint, Match.OneOf(PV.PackageConstraint, String));
  }
  if (typeof packageConstraint === 'string') {
    packageConstraint = PV.parsePackageConstraint(packageConstraint);
  }
  if (flags) {
    check(flags, Object);
  }

  this.packageConstraint = packageConstraint;
  this.isWeak = false;

  if (flags) {
    if (flags.isWeak) {
      this.isWeak = true;
    }
  }
};

// The string form of a Dependency is `?foo@1.0.0` for a weak
// reference to package "foo" with VersionConstraint "1.0.0".
CS.Dependency.prototype.toString = function () {
  var ret = this.packageConstraint.toString();
  if (this.isWeak) {
    ret = '?' + ret;
  }
  return ret;
};

CS.Dependency.fromString = function (str) {
  var isWeak = false;

  if (str.charAt(0) === '?') {
    isWeak = true;
    str = str.slice(1);
  }

  var flags = isWeak ? { isWeak: true } : null;

  return new CS.Dependency(str, flags);
};
