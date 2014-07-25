var semver = Npm.require('semver');

PackageVersion = {};

// Conceptually we have three types of constraints:
// 1. "compatible-with" - A@x.y.z - constraints package A to version x.y.z or
//    higher, as long as the version is backwards compatible with x.y.z.
//    "pick A compatible with x.y.z"
//    It is the default type.
// 2. "exactly" - A@=x.y.z - constraints package A only to version x.y.z and
//    nothing else.
//    "pick A exactly at x.y.z"
// 3. "at-least" - A@>=x.y.z - constraints package A to version x.y.z or higher.
//    "pick A at least at x.y.z"
PackageVersion.parseVersionConstraint = function (versionString) {
  var versionDesc = { version: null, type: "compatible-with",
                      constraintString: versionString };

  // XXX #noconstraint #geoff #changed
  // XXX remove none when it is no longer used
  if (versionString === "none" || versionString === null) {
    versionDesc.type = "at-least";
    versionDesc.version = "0.0.0";
    return versionDesc;
  }

  if (versionString.charAt(0) === '=') {
    versionDesc.type = "exactly";
    versionString = versionString.substr(1);
  } else if (versionString.substr(0, 2) === '>=') {
    versionDesc.type = "at-least";
    versionString = versionString.substr(2);
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

  var constraint = { name: "", version: null,
                     type: "compatible-with", constraintString: null };
  var name = splitted[0];
  var versionString = splitted[1];

  if (! /^[a-z0-9:-]+$/.test(name) || splitted.length > 2)
    throw new Error("Package name must contain only lowercase latin letters, digits, colons, or dashes");

  constraint.name = name;

  if (splitted.length === 2 && !versionString)
    throw new Error("semver version cannot be empty");

  if (versionString)
    _.extend(constraint, PackageVersion.parseVersionConstraint(versionString));

  return constraint;
};

