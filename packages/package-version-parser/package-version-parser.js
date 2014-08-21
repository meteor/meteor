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
//    This one is only used internally by the constraint solver --- end users
//    shouldn't be allowed to specify it, and you need to specially request it
//    with the "allowAtLeast" option.
PackageVersion.parseVersionConstraint = function (versionString, options) {
  options = options || {};
  var versionDesc = { version: null, type: "compatible-with",
                      constraintString: versionString };

  if (versionString === "none" || versionString === null) {
    versionDesc.type = "at-least";
    versionDesc.version = "0.0.0";
    return versionDesc;
  }

  if (versionString.charAt(0) === '=') {
    versionDesc.type = "exactly";
    versionString = versionString.substr(1);
  } else if (options.allowAtLeast && versionString.substr(0, 2) === '>=') {
    versionDesc.type = "at-least";
    versionString = versionString.substr(2);
  }

  // XXX check for a dash in the version in case of foo@1.2.3-rc0

  if (! semver.valid(versionString)) {
    throwVersionParserError(
      "Version string must look like semver (eg '1.2.3'), not '"
        + versionString + "'.");
  }

  versionDesc.version = versionString;

  return versionDesc;
};

PackageVersion.parseConstraint = function (constraintString, options) {
  if (typeof constraintString !== "string")
    throw new TypeError("constraintString must be a string");
  options = options || {};

  var splitted = constraintString.split('@');

  var constraint = { name: "", version: null,
                     type: "compatible-with", constraintString: null };
  var name = splitted[0];
  var versionString = splitted[1];

  if (splitted.length > 2) {
    // throw error complaining about @
    PackageVersion.validatePackageName('a@');
  }
  PackageVersion.validatePackageName(name);

  constraint.name = name;

  if (splitted.length === 2 && !versionString) {
    throwVersionParserError(
      "Version constraint for package '" + name + 
        "' cannot be empty; leave off the @ if you don't want to constrain " +
        "the version.");
  }

  if (versionString) {
    _.extend(constraint,
             PackageVersion.parseVersionConstraint(versionString, options));
  }

  return constraint;
};

// XXX duplicates code in utils.js, sigh.  but we need to run
// this before we can load packages.
PackageVersion.validatePackageName = function (packageName, options) {
  options = options || {};

  var badChar = packageName.match(/[^a-z0-9:.\-]/);
  if (badChar) {
    if (options.detailedColonExplanation) {
      throwVersionParserError(
        "Bad character in package name: " + JSON.stringify(badChar[0]) +
          ". Package names can only contain lowercase ASCII alphanumerics, " +
          "dash, or dot. If you plan to publish a package, it must be " +
          "prefixed with your Meteor developer username and a colon.");
    }
    throwVersionParserError(
      "Package names can only contain lowercase ASCII alphanumerics, dash, " +
        "dot, or colon, not " + JSON.stringify(badChar[0]) + ".");
  }
  if (!/[a-z]/.test(packageName)) {
    throwVersionParserError("Package names must contain a lowercase ASCII letter.");
  }
  if (packageName[0] === '.') {
    throwVersionParserError("Package names may not begin with a dot.");
  }
};
// XXX duplicates code in utils.js, sigh.  but we need to run
// this before we can load packages.
var throwVersionParserError = function (message) {
  var e = new Error(message);
  e.versionParserError = true;
  throw e;
};
