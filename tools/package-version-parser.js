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

// Takes in a meteor version, for example 1.2.3-rc5+1234~1.
//
// Returns an object composed of the following:
//   semver: (ex: 1.2.3)
//   wrapNum: Optional. (ex: 1)
var extractSemverPart = function (versionString) {
  if (!versionString) return { semver: "", wrapNum: 0 };
  var noBuild = versionString.split('+');
  var splitVersion = noBuild[0].split('~');
  return {
    semver: (noBuild.length > 1) ?
        splitVersion[0] + "+" + noBuild[1] :
        splitVersion[0],
    wrapNum: (splitVersion.length > 1) ? splitVersion[1] : 0
  };
};

// Converts a meteor version into a very large number, unique to that version.
PV.hashVersion = function (versionString) {
 // var v = semver.parse(versionString);
 // return v.major * 10000 + v.minor * 100 + v.patch;

  var version = extractSemverPart(versionString);
  var v = semver.parse(version.semver);
  // XXX: This is kind of hacky and relies on not having more than 100 wrap
  // numbers, for example. Probably OK.
  return v.major * 1000000 + v.minor * 10000 +
    v.patch * 100 + version.wrapNum;
};

// Takes in two meteor versions. Returns true if the first one is less than the second.
PV.lessThan = function (versionOne, versionTwo) {
  return PV.compare(versionOne, versionTwo) === -1;
};

// Given a string version, computes its default ECV (not counting any overrides).
//
// versionString: valid meteor version string.
PV.computeECV = function (versionString) {
  var version = extractSemverPart(versionString).semver;
  var parsed = semver.parse(version);
  if (! parsed)
     throwVersionParserError("not a valid version: " + version);
  return parsed.major + ".0.0";
}

// Takes in two meteor versions. Returns 0 if equal, 1 if v1 is greater, -1 if
// v2 is greater.
PV.compare = function (versionOne, versionTwo) {
  var meteorVOne = extractSemverPart(versionOne);
  var meteorVTwo = extractSemverPart(versionTwo);

  // Wrap numbers only matter if the semver is equal, so if they don't even have
  // wrap numbers, or if their semver is not equal, then we should let the
  // semver library resolve this one.
  if ((!meteorVOne.wrapNum && !meteorVTwo.wrapNum) ||
     (meteorVOne.semver !== meteorVTwo.semver)) {
    return semver.compare(meteorVOne.semver, meteorVTwo.semver);
  }

  // If their semver components are equal, then the one with the smaller wrap
  // numbers is smaller.
  var diff = meteorVOne.wrapNum - meteorVTwo.wrapNum;
  if (diff === 0) return 0;
  if (diff > 0) return 1;
  return -1;
};

// Conceptually we have three types of constraints:
// 1. "compatible-with" - A@x.y.z - constraints package A to version x.y.z or
//    higher, as long as the version is backwards compatible with x.y.z.
//    "pick A compatible with x.y.z"
//    It is the default type.
// 2. "exactly" - A@=x.y.z - constraints package A only to version x.y.z and
//    nothing else.
//    "pick A exactly at x.y.z"
// 3. "any-reasonable" - "A"
//    Basically, this means any version of A ... other than ones that have
//    dashes in the version (ie, are prerelease) ... unless the prerelease
//    version has been explicitly selected (which at this stage in the game
//    means they are mentioned in a top-level constraint in the top-level
//    call to the resolver).
PV.parseVersionConstraint = function (versionString, options) {
  options = options || {};
  var versionDesc = { version: null, type: "any-reasonable",
                      constraintString: versionString };

  if (!versionString) {
    return versionDesc;
  }

  if (versionString.charAt(0) === '=') {
    versionDesc.type = "exactly";
    versionString = versionString.substr(1);
  } else {
    versionDesc.type = "compatible-with";
  }

  // This will throw if the version string is invalid.
  PV.getValidServerVersion(versionString);

  versionDesc.version = versionString;

  return versionDesc;
};


// Check to see if the versionString that we pass in is a valid meteor version.
//
// Returns a valid meteor version string that can be included in the
// server. That means that it has everything EXCEPT the build id. Throws if the
// entered string was invalid.
PV.getValidServerVersion = function (meteorVersionString) {

  // Strip out the wrapper num, if present and check that it is valid.
  var version = extractSemverPart(meteorVersionString);
  if ( version.wrapNum && !/^\d+$/.test(version.wrapNum)) {
    throwVersionParserError(
      "The wrap number (after ~) goes last and must only contain digits, so " +
        meteorVersionString + " is invalid.");
  }

  var versionString = version.semver;
  // NPM's semver spec supports things like 'v1.0.0' and considers them valid,
  // but we don't. Everything before the + or - should be of the x.x.x form.
  var mainVersion = versionString.split('+')[0].split('-')[0];
  if (! /^\d+\.\d+\.\d+$/.test(mainVersion)) {
      throwVersionParserError(
        "Version string must look like semver (eg '1.2.3'), not '"
          + versionString + "'.");
  };

  var cleanVersion = semver.valid(versionString);
  if (! cleanVersion ) {
    throwVersionParserError(
      "Version string must look like semver (eg '1.2.3'), not '"
        + versionString + "'.");
  }

  if (version.wrapNum) {
    cleanVersion = cleanVersion + "~" + version.wrapNum;
  }

  return cleanVersion;
};


PV.parseConstraint = function (constraintString, options) {
  if (typeof constraintString !== "string")
    throw new TypeError("constraintString must be a string");
  options = options || {};

  var splitted = constraintString.split('@');

  var constraint = { name: "", version: null,
                     type: "any-reasonable", constraintString: null };
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

// XXX if we were better about consistently only using functions in this file,
// we could just do this using the constraintString field
PV.constraintToVersionString = function (parsedConstraint) {
  if (parsedConstraint.type === "any-reasonable")
    return "";
  if (parsedConstraint.type === "compatible-with")
    return parsedConstraint.version;
  if (parsedConstraint.type === "exactly")
    return "=" + parsedConstraint.version;
  throw Error("Unknown constraint type: " + parsedConstraint.type);
};

PV.constraintToFullString = function (parsedConstraint) {
  return parsedConstraint.name + "@" + PV.constraintToVersionString(
    parsedConstraint);
};
