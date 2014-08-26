// This file is in tools/package-version-parser.js and is symlinked into
// packages/package-version-parser/package-version-parser.js. It's part
// of both the tool and the package!  We don't use uniload for it because
// it needs to be used as part of initializing the uniload catalog.

var inTool = typeof Package === 'undefined';

var PV;
if (inTool) {
  PV = exports;
} else {
  PackageVersion = PV = {};
}

var semver = inTool ? require ('semver') : Npm.require('semver');
var __ = inTool ? require('underscore') : _;

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
PV.parseVersionConstraint = function (versionString, options) {
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

PV.parseConstraint = function (constraintString, options) {
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
    PV.validatePackageName('a@');
  }
  PV.validatePackageName(name);

  constraint.name = name;

  if (splitted.length === 2 && !versionString) {
    throwVersionParserError(
      "Version constraint for package '" + name +
        "' cannot be empty; leave off the @ if you don't want to constrain " +
        "the version.");
  }

  if (versionString) {
    __.extend(constraint,
              PV.parseVersionConstraint(versionString, options));
  }

  return constraint;
};

PV.validatePackageName = function (packageName, options) {
  options = options || {};

  var badChar = packageName.match(/[^a-z0-9:.\-]/);
  if (badChar) {
    if (options.detailedColonExplanation) {
      throwVersionParserError(
        "Bad character in package name: " + JSON.stringify(badChar[0]) +
          ".\n\nPackage names can only contain lowercase ASCII alphanumerics, " +
          "dash, or dot.\nIf you plan to publish a package, it must be " +
          "prefixed with your\nMeteor Developer Account username and a colon.");
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

var throwVersionParserError = function (message) {
  var e = new Error(message);
  e.versionParserError = true;
  throw e;
};
