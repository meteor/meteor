var semver = Npm.require('semver');

PackageVersion = {};

PackageVersion.parseVersionConstraint = function (versionString) {
  var versionDesc = { version: null, exact: false };

  // XXX #noconstraint #geoff #changed
  // XXX remove none when it is no longer used
  if (versionString === "none" || versionString === null) {
    return versionDesc;
  }

  if (versionString.charAt(0) === '=') {
    versionDesc.exact = true;
    versionString = versionString.substr(1);
  }

  // XXX check for a dash in the version in case of foo@1.2.3-rc0

  if (! semver.valid(versionString))
    throw new Error("Version string must look like semver (1.2.3) -- " + versionString);

  versionDesc.version = versionString;

  return versionDesc;
};

PackageVersion.parseConstraint = function (constraintString) {
  if (typeof constraintString !== "string")
    throw new TypeError("constraintString must be a string");

  var splitted = constraintString.split('@');

  var constraint = { name: "", version: null, exact: false };
  var name = splitted[0];
  var versionString = splitted[1];

  if (! /^[a-z0-9-]+$/.test(name) || splitted.length > 2)
    throw new Error("Package name must contain lowercase latin letters, digits or dashes");

  constraint.name = name;

  if (splitted.length === 2 && !versionString)
    throw new Error("semver version cannot be empty");

  if (versionString)
    _.extend(constraint, PackageVersion.parseVersionConstraint(versionString));

  return constraint;
};
